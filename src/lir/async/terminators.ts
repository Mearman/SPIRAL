// SPIRAL LIR Async Evaluator - Terminator Handlers

import { ErrorCodes, exhaustive } from "../../errors.ts";
import { extendValueEnv, lookupValue } from "../../env.ts";
import type { OperatorRegistry } from "../../domains/registry.ts";
import type { EffectRegistry } from "../../effects.ts";
import type {
	LirBlock,
	LirHybridNode,
	LirTerminator,
	EirTerminator,
	EirTermFork,
	EirTermJoin,
	EirTermSuspend,
	Value,
} from "../../types.ts";
import {
	errorVal,
	isError,
	isFuture,
	voidVal,
} from "../../types.ts";
import type { ForkContext, InstructionContext, LIRAsyncRuntimeState, TerminatorContext } from "./types.ts";

//==============================================================================
// Individual Terminator Handlers
//==============================================================================

function handleJump(term: LirTerminator & { kind: "jump" }): string {
	return term.to;
}

function handleBranch(
	term: LirTerminator & { kind: "branch" },
	state: LIRAsyncRuntimeState,
): string | Value {
	const condValue = lookupValue(state.vars, term.cond);
	if (!condValue) {
		return errorVal(ErrorCodes.UnboundIdentifier, "Condition variable not found: " + term.cond);
	}
	if (condValue.kind === "error") {
		return condValue;
	}
	if (condValue.kind !== "bool") {
		return errorVal(ErrorCodes.TypeError, `Branch condition must be bool, got: ${condValue.kind}`);
	}
	return condValue.value ? term.then : term.else;
}

function handleReturn(
	term: LirTerminator & { kind: "return" },
	state: LIRAsyncRuntimeState,
): Value {
	if (term.value) {
		const returnValue = lookupValue(state.vars, term.value);
		if (!returnValue) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Return value not found: " + term.value);
		}
		state.returnValue = returnValue;
		return returnValue;
	}
	return voidVal();
}

function handleExit(
	term: LirTerminator & { kind: "exit" },
	state: LIRAsyncRuntimeState,
): Value {
	if (term.code !== undefined) {
		const codeStr = typeof term.code === "number" ? String(term.code) : term.code;
		const codeValue = lookupValue(state.vars, codeStr);
		if (codeValue) {
			return codeValue;
		}
	}
	return voidVal();
}

function handleFork(
	term: EirTermFork,
	ctx: TerminatorContext,
): Promise<string | Value> | Value {
	if (!ctx.registry) {
		return errorVal(ErrorCodes.DomainError, "Fork terminator requires operator registry");
	}
	if (!ctx.effectRegistry) {
		return errorVal(ErrorCodes.DomainError, "Fork terminator requires effect registry");
	}
	return executeForkTerminatorImpl(term, {
		state: ctx.state,
		blocks: ctx.blocks,
		nodeMap: ctx.nodeMap,
		registry: ctx.registry,
		effectRegistry: ctx.effectRegistry,
	});
}

//==============================================================================
// EIR Async Terminator Handlers (exported for tests)
//==============================================================================

/**
 * Execute fork terminator: spawn branches concurrently, wait for all to complete.
 * Maintains backward-compatible positional parameter signature.
 */
type ExecuteForkFn = (
	...args: [
		term: EirTermFork,
		state: LIRAsyncRuntimeState,
		blocks: LirBlock[],
		nodeMap: Map<string, LirHybridNode>,
		registry: OperatorRegistry,
		effectRegistry: EffectRegistry,
	]
) => Promise<string | Value>;

export const executeForkTerminator: ExecuteForkFn = (
	...args
) => {
	const [term, state, blocks, nodeMap, registry, effectRegistry] = args;
	return executeForkTerminatorImpl(term, {
		state, blocks, nodeMap, registry, effectRegistry,
	});
};

async function executeForkTerminatorImpl(
	term: EirTermFork,
	forkCtx: ForkContext,
): Promise<string | Value> {
	for (const branch of term.branches) {
		spawnForkBranch(branch, forkCtx);
	}

	await Promise.all(
		term.branches.map((b) => forkCtx.state.scheduler.await(b.taskId)),
	);
	return term.continuation;
}

function spawnForkBranch(
	branch: { taskId: string; block: string },
	forkCtx: ForkContext,
): void {
	const block = forkCtx.blocks.find((b) => b.id === branch.block);
	if (!block) {
		forkCtx.state.scheduler.spawn(branch.taskId, () => Promise.resolve(
			errorVal(ErrorCodes.DomainError, `Fork block not found: ${branch.block}`),
		));
		return;
	}

	forkCtx.state.scheduler.spawn(branch.taskId, () =>
		executeForkBranchCfg(branch.block, forkCtx),
	);
}

function buildForkContexts(forkCtx: ForkContext): { ctx: InstructionContext; termCtx: TerminatorContext } {
	return {
		ctx: { state: forkCtx.state, registry: forkCtx.registry, effectRegistry: forkCtx.effectRegistry },
		termCtx: { state: forkCtx.state, blocks: forkCtx.blocks, nodeMap: forkCtx.nodeMap, registry: forkCtx.registry, effectRegistry: forkCtx.effectRegistry },
	};
}

async function executeForkBranchStep(
	currentBlock: LirBlock,
	contexts: { ctx: InstructionContext; termCtx: TerminatorContext },
): Promise<string | Value> {
	const { executeBlockAsync } = await import("./instructions.js");
	const insResult = await executeBlockAsync(currentBlock, contexts.ctx);
	if (insResult && isError(insResult)) {
		return insResult;
	}
	return executeTerminatorAsync(currentBlock.terminator, contexts.termCtx);
}

function findForkBlock(
	blockId: string,
	blocks: LirBlock[],
): LirBlock | Value {
	const block = blocks.find((b) => b.id === blockId);
	return block ?? errorVal(ErrorCodes.DomainError, `Fork branch block not found: ${blockId}`);
}

async function executeForkBlockAndStep(
	blockId: string,
	forkCtx: ForkContext,
	contexts: { ctx: InstructionContext; termCtx: TerminatorContext },
): Promise<string | Value> {
	const block = findForkBlock(blockId, forkCtx.blocks);
	if ("kind" in block) {
		return block;
	}
	return executeForkBranchStep(block, contexts);
}

async function executeForkBranchCfg(
	startBlockId: string,
	forkCtx: ForkContext,
): Promise<Value> {
	let currentBlockId: string | undefined = startBlockId;
	const contexts = buildForkContexts(forkCtx);

	while (currentBlockId) {
		const stepResult = await executeForkBlockAndStep(currentBlockId, forkCtx, contexts);
		if (typeof stepResult !== "string") {
			return stepResult;
		}
		forkCtx.state.predecessor = currentBlockId;
		currentBlockId = stepResult;
	}
	return voidVal();
}

/**
 * Execute join terminator: wait for tasks and bind results to variables
 */
export async function executeJoinTerminator(
	term: EirTermJoin,
	state: LIRAsyncRuntimeState,
): Promise<string | Value> {
	const results = await Promise.all(
		term.tasks.map((taskId) => state.scheduler.await(taskId)),
	);

	if (term.results) {
		bindJoinResults(term.results, results, state);
	}
	return term.to;
}

function bindJoinResults(
	targets: string[],
	results: Value[],
	state: LIRAsyncRuntimeState,
): void {
	for (let i = 0; i < results.length; i++) {
		const targetVar = targets[i];
		const resultValue = results[i];
		if (targetVar !== undefined && resultValue !== undefined) {
			state.vars = extendValueEnv(state.vars, targetVar, resultValue);
			state.refCells.set(targetVar, { kind: "refCell", value: resultValue });
		}
	}
}

/**
 * Execute suspend terminator: await a future, then resume at resumeBlock
 */
export async function executeSuspendTerminator(
	term: EirTermSuspend,
	state: LIRAsyncRuntimeState,
): Promise<string | Value> {
	const futureValue = lookupValue(state.vars, term.future);
	if (!futureValue || !isFuture(futureValue)) {
		return errorVal(ErrorCodes.TypeError, "suspend requires a Future value");
	}
	await state.scheduler.await(futureValue.taskId);
	return term.resumeBlock;
}

//==============================================================================
// Terminator Dispatch
//==============================================================================

/**
 * Execute a terminator to determine the next block (async version).
 * Returns the next block id, or a Value for return/exit.
 */
export async function executeTerminatorAsync(
	term: LirTerminator | EirTerminator,
	ctx: TerminatorContext,
): Promise<string | Value> {
	switch (term.kind) {
	case "jump":
		return handleJump(term);
	case "branch":
		return handleBranch(term, ctx.state);
	case "return":
		return handleReturn(term, ctx.state);
	case "exit":
		return handleExit(term, ctx.state);
	case "fork":
		return handleFork(term, ctx);
	case "join":
		return executeJoinTerminator(term, ctx.state);
	case "suspend":
		return executeSuspendTerminator(term, ctx.state);
	default:
		return exhaustive(term);
	}
}
