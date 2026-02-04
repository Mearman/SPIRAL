// CFG Fork, Join, and Suspend Terminator Handlers

import { ErrorCodes } from "../errors.ts";
import {
	type Value,
	voidVal,
	isFuture,
	errorVal,
	isError,
} from "../types.ts";
import type { EirBlock } from "../types.ts";
import type { AsyncEvalContext } from "./types.ts";

//==============================================================================
// execFork - types and helpers
//==============================================================================

interface ContinuationState {
	executed: boolean;
	result: Value | undefined;
}

interface ForkBranchInput {
	block: EirBlock;
	blockMap: Map<string, EirBlock>;
	continuation: string;
	contState: ContinuationState;
}

interface ContinuationInput {
	blockMap: Map<string, EirBlock>;
	contState: ContinuationState;
	continuation: string;
}

async function runBranchInstructions(block: EirBlock, ctx: AsyncEvalContext): Promise<Value | null> {
	for (const instr of block.instructions) {
		const result = await ctx.svc.execInstruction(instr, ctx);
		if (isError(result)) return result;
	}
	return null;
}

async function runContinuationBlock(
	block: EirBlock,
	input: ContinuationInput,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const instrErr = await runBranchInstructions(block, ctx);
	if (instrErr) {
		input.contState.result = instrErr;
		return instrErr;
	}
	const termResult = await ctx.svc.execTerminator(block.terminator, input.blockMap, ctx);
	if (termResult.done) {
		input.contState.result = termResult.value ?? voidVal();
		return input.contState.result;
	}
	return voidVal();
}

function executeContinuation(input: ContinuationInput, ctx: AsyncEvalContext): Promise<Value> | Value {
	const nextBlock = input.blockMap.get(input.continuation);
	if (!nextBlock) return voidVal();
	return runContinuationBlock(nextBlock, input, ctx);
}

function tryExecuteContinuation(
	nextBlock: string | undefined,
	input: ForkBranchInput,
	ctx: AsyncEvalContext,
): Promise<Value> | Value | undefined {
	if (nextBlock !== input.continuation || input.contState.executed) return undefined;
	input.contState.executed = true;
	const contInput: ContinuationInput = {
		blockMap: input.blockMap, contState: input.contState, continuation: input.continuation,
	};
	return executeContinuation(contInput, ctx);
}

async function executeBranchBody(input: ForkBranchInput, ctx: AsyncEvalContext): Promise<Value> {
	let currentBlock: EirBlock | undefined = input.block;

	for (let i = 0; i < 10_000 && currentBlock; i++) {
		const instrErr = await runBranchInstructions(currentBlock, ctx);
		if (instrErr) return instrErr;

		const termResult = await ctx.svc.execTerminator(currentBlock.terminator, input.blockMap, ctx);
		if (termResult.done) return termResult.value ?? voidVal();

		const contResult = tryExecuteContinuation(termResult.nextBlock, input, ctx);
		if (contResult) return contResult;

		currentBlock = termResult.nextBlock ? input.blockMap.get(termResult.nextBlock) : undefined;
	}

	return voidVal();
}

function spawnForkBranch(input: ForkBranchInput, taskId: string, ctx: AsyncEvalContext): void {
	ctx.state.scheduler.spawn(taskId, async () => {
		try {
			return await executeBranchBody(input, ctx);
		} catch (error) {
			const err = errorVal(ErrorCodes.DomainError, `Fork branch error: ${String(error)}`);
			if (!input.contState.executed) input.contState.result = err;
			return err;
		}
	});
}

interface ForkSetup {
	term: { branches: { block: string; taskId: string }[]; continuation: string };
	blockMap: Map<string, EirBlock>;
	contState: ContinuationState;
}

function spawnForkBranches(setup: ForkSetup, ctx: AsyncEvalContext): string[] {
	const taskIds: string[] = [];
	for (const branch of setup.term.branches) {
		const block = setup.blockMap.get(branch.block);
		if (!block) {
			ctx.state.scheduler.spawn(branch.taskId, () =>
				Promise.resolve(errorVal(ErrorCodes.DomainError, `Fork block not found: ${branch.block}`)),
			);
		} else {
			const input: ForkBranchInput = {
				block, blockMap: setup.blockMap, continuation: setup.term.continuation, contState: setup.contState,
			};
			spawnForkBranch(input, branch.taskId, ctx);
		}
		taskIds.push(branch.taskId);
	}
	return taskIds;
}

//==============================================================================
// execFork
//==============================================================================

export async function execFork(
	term: { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string },
	blockMap: Map<string, EirBlock>,
	ctx: AsyncEvalContext,
): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
	const contState: ContinuationState = { executed: false, result: undefined };
	const taskIds = spawnForkBranches({ term, blockMap, contState }, ctx);
	await Promise.all(taskIds.map((id) => ctx.state.scheduler.await(id)));
	if (contState.executed) {
		return { done: true, value: contState.result ?? voidVal() };
	}
	return { done: false, nextBlock: term.continuation };
}

//==============================================================================
// execJoin
//==============================================================================

function storeJoinResults(results: Value[], targets: string[] | undefined, ctx: AsyncEvalContext): void {
	if (!targets) return;
	for (let i = 0; i < results.length; i++) {
		const cell = targets[i];
		const val = results[i];
		if (cell !== undefined && val !== undefined) {
			ctx.state.refCells.set(cell, { kind: "refCell", value: val });
		}
	}
}

export async function execJoin(
	term: { kind: "join"; tasks: string[]; results?: string[] | undefined; to: string },
	ctx: AsyncEvalContext,
): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
	const results = await Promise.all(
		term.tasks.map((taskId) => ctx.state.scheduler.await(taskId)),
	);
	storeJoinResults(results, term.results, ctx);
	return { done: false, nextBlock: term.to };
}

//==============================================================================
// execSuspend
//==============================================================================

export async function execSuspend(
	term: { kind: "suspend"; future: string; resumeBlock: string },
	ctx: AsyncEvalContext,
): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
	const futureValue = ctx.nodeValues.get(term.future);
	if (!futureValue || !isFuture(futureValue)) {
		return { done: true, value: errorVal(ErrorCodes.TypeError, "suspend requires a Future value") };
	}
	await ctx.state.scheduler.await(futureValue.taskId);
	return { done: false, nextBlock: term.resumeBlock };
}
