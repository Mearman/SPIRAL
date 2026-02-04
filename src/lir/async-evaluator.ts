// SPIRAL LIR Async Evaluator
// Async CFG-based execution for LIR with fork/join/suspend terminators
// and spawn/channelOp/await instructions

import { ErrorCodes } from "../errors.ts";
import {
	type Defs,
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
	type ValueEnv,
} from "../env.ts";
import type { OperatorRegistry } from "../domains/registry.ts";
import type { EffectRegistry } from "../effects.ts";
import type { LIRDocument, LirBlock, LirHybridNode, Value } from "../types.ts";
import { errorVal, isBlockNode, isExprNode, voidVal } from "../types.ts";
import { Evaluator } from "../evaluator.ts";
import { createTaskScheduler } from "../scheduler.ts";
import { createAsyncChannelStore } from "../async-effects.ts";

// Re-export types and handlers from sub-modules (public API)
export type { LIRAsyncEvalOptions, LIRAsyncRuntimeState } from "./async/types.ts";
export {
	executeSpawnInstruction,
	executeChannelOpInstruction,
	executeAwaitInstruction,
} from "./async/instructions.ts";
export {
	executeForkTerminator,
	executeJoinTerminator,
	executeSuspendTerminator,
} from "./async/terminators.ts";

import type { LIRAsyncEvalOptions, LIRAsyncRuntimeState } from "./async/types.ts";
import type { InstructionContext, TerminatorContext } from "./async/types.ts";
import { executeBlockAsync } from "./async/instructions.ts";
import { executeTerminatorAsync } from "./async/terminators.ts";

//==============================================================================
// Evaluation Inputs (parameter object pattern)
//==============================================================================

interface EvalInputs {
	doc: LIRDocument;
	registry: OperatorRegistry;
	effectRegistry: EffectRegistry;
	inputs?: ValueEnv | undefined;
	options?: LIRAsyncEvalOptions | undefined;
	defs?: Defs | undefined;
}

interface EvalResult {
	result: Value;
	state: LIRAsyncRuntimeState;
}

interface CfgTarget {
	blocks: LirBlock[];
	entry: string;
}

//==============================================================================
// Initialization Helpers
//==============================================================================

function createInitialState(params: EvalInputs): LIRAsyncRuntimeState {
	const scheduler = params.options?.scheduler ?? createTaskScheduler({
		globalMaxSteps: params.options?.maxSteps ?? 1_000_000,
	});

	return {
		vars: params.inputs ?? emptyValueEnv(),
		effects: [],
		steps: 0,
		maxSteps: params.options?.maxSteps ?? 10000,
		taskId: "main",
		scheduler,
		channels: createAsyncChannelStore(),
		refCells: new Map(),
	};
}

function buildNodeMap(doc: LIRDocument): Map<string, LirHybridNode> {
	const nodeMap = new Map<string, LirHybridNode>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}
	return nodeMap;
}

function evaluateExpressionNodes(
	params: EvalInputs,
	state: LIRAsyncRuntimeState,
): void {
	const emptyDefs: Defs = new Map();
	const evaluator = new Evaluator(params.registry, params.defs ?? emptyDefs);

	for (const node of params.doc.nodes) {
		if (isExprNode(node)) {
			const value = evaluator.evaluate(node.expr, state.vars);
			state.vars = extendValueEnv(state.vars, node.id, value);
		}
	}
}

function resolveResultNode(
	doc: LIRDocument,
	nodeMap: Map<string, LirHybridNode>,
	state: LIRAsyncRuntimeState,
): EvalResult | CfgTarget {
	const resultNode = nodeMap.get(doc.result);
	if (!resultNode) {
		return {
			result: errorVal(ErrorCodes.ValidationError, "Result node not found: " + doc.result),
			state,
		};
	}

	if (isExprNode(resultNode)) {
		const value = lookupValue(state.vars, resultNode.id);
		return {
			result: value ?? errorVal(ErrorCodes.UnboundIdentifier, "Result node value not found"),
			state,
		};
	}

	if (!isBlockNode(resultNode)) {
		return {
			result: errorVal(ErrorCodes.DomainError, "Result node must be expression or block node"),
			state,
		};
	}

	return { blocks: resultNode.blocks, entry: resultNode.entry };
}

//==============================================================================
// CFG Execution Loop
//==============================================================================

interface CfgLoopContext {
	state: LIRAsyncRuntimeState;
	blocks: LirBlock[];
	executedBlocks: Set<string>;
	instrCtx: InstructionContext;
	termCtx: TerminatorContext;
}

function findBlock(
	blockId: string,
	blocks: LirBlock[],
): LirBlock | Value {
	const block = blocks.find((b: LirBlock) => b.id === blockId);
	if (!block) {
		return errorVal(ErrorCodes.ValidationError, "Block not found: " + blockId);
	}
	return block;
}

async function executeOneBlock(
	block: LirBlock,
	loopCtx: CfgLoopContext,
): Promise<string | Value> {
	await loopCtx.state.scheduler.checkGlobalSteps();

	const insResult = await executeBlockAsync(block, loopCtx.instrCtx);
	if (insResult) {
		return insResult;
	}

	return executeTerminatorAsync(block.terminator, loopCtx.termCtx);
}

function wrapResult(
	state: LIRAsyncRuntimeState,
	value: Value,
): EvalResult {
	return { result: value, state };
}

async function executeVisitedBlock(
	blockId: string,
	loopCtx: CfgLoopContext,
): Promise<string | Value> {
	const stepErr = trackBlockVisit(loopCtx.executedBlocks, blockId, loopCtx.state);
	if (stepErr) {
		return stepErr;
	}
	const block = findBlock(blockId, loopCtx.blocks);
	if ("kind" in block) {
		return block;
	}
	return executeOneBlock(block, loopCtx);
}

async function executeCfgLoop(
	target: CfgTarget,
	loopCtx: CfgLoopContext,
): Promise<EvalResult> {
	let currentBlockId: string | undefined = target.entry;

	while (currentBlockId) {
		const stepResult = await executeVisitedBlock(currentBlockId, loopCtx);
		if (typeof stepResult === "object") {
			return wrapResult(loopCtx.state, stepResult);
		}
		loopCtx.state.predecessor = currentBlockId;
		currentBlockId = stepResult;
	}

	return wrapResult(loopCtx.state, loopCtx.state.returnValue ?? voidVal());
}

function trackBlockVisit(
	executedBlocks: Set<string>,
	blockId: string,
	state: LIRAsyncRuntimeState,
): Value | undefined {
	if (executedBlocks.has(blockId)) {
		state.steps++;
		if (state.steps > state.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "LIR async execution exceeded maximum steps");
		}
	} else {
		executedBlocks.add(blockId);
	}
	return undefined;
}

//==============================================================================
// Main Entry Point
//==============================================================================

function buildLoopContext(
	params: EvalInputs,
	target: CfgTarget,
	state: LIRAsyncRuntimeState,
): CfgLoopContext {
	const nodeMap = buildNodeMap(params.doc);
	return {
		state,
		blocks: target.blocks,
		executedBlocks: new Set<string>(),
		instrCtx: { state, registry: params.registry, effectRegistry: params.effectRegistry },
		termCtx: { state, blocks: target.blocks, nodeMap, registry: params.registry, effectRegistry: params.effectRegistry },
	};
}

function validateAndExecuteCfg(
	params: EvalInputs,
	state: LIRAsyncRuntimeState,
	target: CfgTarget,
): Promise<EvalResult> | EvalResult {
	const entryBlock = target.blocks.find((b: LirBlock) => b.id === target.entry);
	if (!entryBlock) {
		return {
			result: errorVal(ErrorCodes.ValidationError, "Entry block not found: " + target.entry),
			state,
		};
	}
	const loopCtx = buildLoopContext(params, target, state);
	return executeCfgLoop(target, loopCtx);
}

async function evaluateLIRAsyncImpl(params: EvalInputs): Promise<EvalResult> {
	const state = createInitialState(params);

	evaluateExpressionNodes(params, state);

	const resolved = resolveResultNode(params.doc, buildNodeMap(params.doc), state);
	if ("result" in resolved) {
		return resolved;
	}

	return validateAndExecuteCfg(params, state, resolved);
}

type EvaluateLIRAsyncFn = (
	...args: [
		doc: LIRDocument,
		registry: OperatorRegistry,
		effectRegistry: EffectRegistry,
		inputs?: ValueEnv,
		options?: LIRAsyncEvalOptions,
		defs?: Defs,
	]
) => Promise<EvalResult>;

/**
 * Evaluate an LIR program asynchronously with CFG-based execution.
 *
 * LIR async execution follows control flow through basic blocks with async support:
 * - Start at entry block
 * - Execute instructions sequentially
 * - Execute terminator to determine next block (including async terminators)
 * - Handle fork/join/suspend for concurrent execution
 * - Continue until return/exit terminator
 */
export const evaluateLIRAsync: EvaluateLIRAsyncFn = (...args) => {
	const [doc, registry, effectRegistry, inputs, options, defs] = args;
	return evaluateLIRAsyncImpl({ doc, registry, effectRegistry, inputs, options, defs });
};
