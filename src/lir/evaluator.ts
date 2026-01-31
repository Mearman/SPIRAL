// SPIRAL LIR Evaluator
// Executes Control Flow Graph (CFG) based LIR programs

import { ErrorCodes } from "../errors.js";
import {
	type Defs,
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
	type ValueEnv,
} from "../env.js";
import type { OperatorRegistry } from "../domains/registry.js";
import type { EffectRegistry } from "../effects.js";
import type { LIRDocument, LirBlock, LirHybridNode, Value } from "../types.js";
import { errorVal, isBlockNode, isExprNode, voidVal } from "../types.js";
import { Evaluator } from "../evaluator.js";
import type {
	EvalLIRParams,
	EvalLIRResult,
	ExecContext,
	LIRRuntimeState,
} from "./exec-context.js";
import { executeInstruction } from "./instructions.js";
import { executeTerminator } from "./terminators.js";

export type { LIREvalOptions } from "./exec-context.js";

type EvaluateLIRFn = (
	...args: [
		doc: LIRDocument,
		registry: OperatorRegistry,
		effectRegistry: EffectRegistry,
		inputs?: ValueEnv,
		options?: { maxSteps?: number; trace?: boolean; effects?: EffectRegistry },
		defs?: Defs,
	]
) => EvalLIRResult;

/**
 * Evaluate an LIR program (CFG-based execution).
 *
 * LIR execution follows control flow through basic blocks:
 * - Start at entry block
 * - Execute instructions sequentially
 * - Execute terminator to determine next block
 * - Continue until return/exit terminator
 */
export const evaluateLIR: EvaluateLIRFn = (...args) => {
	const [doc, registry, effectRegistry, inputs, options, defs] = args;
	const params: EvalLIRParams = { doc, registry, effectRegistry };
	if (inputs !== undefined) params.inputs = inputs;
	if (options !== undefined) params.options = options;
	if (defs !== undefined) params.defs = defs;
	return evaluateLIRImpl(params);
};

function initState(params: EvalLIRParams): LIRRuntimeState {
	return {
		vars: params.inputs ?? emptyValueEnv(),
		effects: [],
		steps: 0,
		maxSteps: params.options?.maxSteps ?? 10000,
	};
}

function evaluateExprNodes(
	params: EvalLIRParams,
	state: LIRRuntimeState,
): void {
	const emptyDefs: Defs = new Map();
	const ev = new Evaluator(
		params.registry,
		params.defs ?? emptyDefs,
	);
	for (const node of params.doc.nodes) {
		if (isExprNode(node)) {
			const value = ev.evaluate(node.expr, state.vars);
			state.vars = extendValueEnv(state.vars, node.id, value);
		}
	}
}

function resolveResultNode(
	params: EvalLIRParams,
	state: LIRRuntimeState,
	nodeMap: Map<string, LirHybridNode>,
): EvalLIRResult | undefined {
	const resultNode = nodeMap.get(params.doc.result);
	if (!resultNode) {
		return {
			result: errorVal(
				ErrorCodes.ValidationError,
				"Result node not found: " + params.doc.result,
			),
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
			result: errorVal(
				ErrorCodes.DomainError,
				"Result node must be expression or block node",
			),
			state,
		};
	}
	return undefined;
}

function findEntryBlock(
	params: EvalLIRParams,
	state: LIRRuntimeState,
	nodeMap: Map<string, LirHybridNode>,
): { blocks: LirBlock[]; entry: string } | EvalLIRResult {
	const resultNode = nodeMap.get(params.doc.result);
	if (!resultNode || !isBlockNode(resultNode)) {
		return { result: voidVal(), state };
	}
	const { blocks, entry } = resultNode;
	const found = blocks.find((b: LirBlock) => b.id === entry);
	if (!found) {
		return {
			result: errorVal(
				ErrorCodes.ValidationError,
				"Entry block not found: " + entry,
			),
			state,
		};
	}
	return { blocks, entry };
}

function checkLoopStep(
	currentBlockId: string,
	executedBlocks: Set<string>,
	ctx: ExecContext,
): EvalLIRResult | undefined {
	if (executedBlocks.has(currentBlockId)) {
		ctx.state.steps++;
		if (ctx.state.steps > ctx.state.maxSteps) {
			return {
				result: errorVal(ErrorCodes.NonTermination, "LIR execution exceeded maximum steps"),
				state: ctx.state,
			};
		}
	} else {
		executedBlocks.add(currentBlockId);
	}
	return undefined;
}

function executeBlock(
	block: LirBlock,
	ctx: ExecContext,
): Value | undefined {
	for (const ins of block.instructions) {
		ctx.state.steps++;
		if (ctx.state.steps > ctx.state.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block execution exceeded maximum steps");
		}
		const result = executeInstruction(ins, ctx);
		if (result) {
			return result;
		}
	}
	return undefined;
}

function findBlock(
	blocks: LirBlock[],
	id: string,
): LirBlock | undefined {
	return blocks.find((b: LirBlock) => b.id === id);
}

function runTerminator(
	block: LirBlock,
	blockId: string,
	ctx: ExecContext,
): EvalLIRResult | string | undefined {
	const termResult = executeTerminator(block.terminator, ctx.state);
	if (typeof termResult === "object") {
		return { result: termResult, state: ctx.state };
	}
	ctx.state.predecessor = blockId;
	return termResult;
}

function stepBlock(
	blocks: LirBlock[],
	currentBlockId: string,
	ctx: ExecContext,
): EvalLIRResult | string | undefined {
	const currentBlock = findBlock(blocks, currentBlockId);
	if (!currentBlock) {
		return {
			result: errorVal(ErrorCodes.ValidationError, "Block not found: " + currentBlockId),
			state: ctx.state,
		};
	}
	const insResult = executeBlock(currentBlock, ctx);
	if (insResult) {
		return { result: insResult, state: ctx.state };
	}
	return runTerminator(currentBlock, currentBlockId, ctx);
}

interface BlockLoopState {
	blocks: LirBlock[];
	executedBlocks: Set<string>;
	ctx: ExecContext;
}

function iterateBlock(
	blockId: string,
	loop: BlockLoopState,
): EvalLIRResult | string | undefined {
	const loopErr = checkLoopStep(blockId, loop.executedBlocks, loop.ctx);
	if (loopErr) return loopErr;
	return stepBlock(loop.blocks, blockId, loop.ctx);
}

function runBlockLoop(
	blocks: LirBlock[],
	entry: string,
	ctx: ExecContext,
): EvalLIRResult {
	const loop: BlockLoopState = { blocks, executedBlocks: new Set<string>(), ctx };
	let currentBlockId: string | undefined = entry;
	while (currentBlockId) {
		const step = iterateBlock(currentBlockId, loop);
		if (typeof step === "object") return step;
		currentBlockId = step;
	}
	return { result: ctx.state.returnValue ?? voidVal(), state: ctx.state };
}

function buildNodeMap(params: EvalLIRParams): Map<string, LirHybridNode> {
	const nodeMap = new Map<string, LirHybridNode>();
	for (const node of params.doc.nodes) {
		nodeMap.set(node.id, node);
	}
	return nodeMap;
}

function makeContext(
	params: EvalLIRParams,
	state: LIRRuntimeState,
): ExecContext {
	return {
		state,
		registry: params.registry,
		effectRegistry: params.effectRegistry,
	};
}

function evaluateLIRImpl(params: EvalLIRParams): EvalLIRResult {
	const state = initState(params);
	const nodeMap = buildNodeMap(params);
	evaluateExprNodes(params, state);
	const early = resolveResultNode(params, state, nodeMap);
	if (early) return early;
	const cfg = findEntryBlock(params, state, nodeMap);
	if ("result" in cfg) return cfg;
	return runBlockLoop(cfg.blocks, cfg.entry, makeContext(params, state));
}
