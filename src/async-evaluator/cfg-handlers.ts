// CFG Instruction and Terminator Handlers

import { lookupOperator } from "../domains/registry.js";
import { extendValueEnvMany } from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type Value,
	voidVal,
	isFuture,
	isChannel,
	futureVal,
	errorVal,
	isError,
	isBlockNode,
} from "../types.js";
import type { PirInsChannelOp, Expr } from "../types.js";
import { getChannels } from "./pir-handlers.js";
import type { AsyncEvalContext } from "./types.js";

// Re-export fork, join, suspend terminators
export { execFork, execJoin, execSuspend } from "./cfg-fork.js";

//==============================================================================
// execAssign
//==============================================================================

function updateRefCell(target: string, value: Value, ctx: AsyncEvalContext): void {
	let cell = ctx.state.refCells.get(target);
	if (cell?.kind === "refCell") {
		cell.value = value;
	} else {
		cell = { kind: "refCell", value };
		ctx.state.refCells.set(target, cell);
	}
	ctx.nodeValues.set(target, value);
}

export async function execAssign(
	instr: { kind: "assign"; target: string; value: Expr },
	ctx: AsyncEvalContext,
): Promise<Value> {
	const value = await ctx.svc.evalExpr(instr.value, ctx.state.env, ctx);
	if (isError(value)) return value;
	updateRefCell(instr.target, value, ctx);
	return voidVal();
}

//==============================================================================
// execOp
//==============================================================================

function executeOp(instr: { target: string; ns: string; name: string; args: string[] }, ctx: AsyncEvalContext): Value {
	const argValues = instr.args.map((argId) => ctx.nodeValues.get(argId) ?? voidVal());
	const op = lookupOperator(ctx.svc.registry, instr.ns, instr.name);
	if (!op) {
		return errorVal(ErrorCodes.UnknownOperator, `Unknown operator: ${instr.ns}:${instr.name}`);
	}
	try {
		const result = op.fn(...argValues);
		ctx.state.refCells.set(instr.target, { kind: "refCell", value: result });
		ctx.nodeValues.set(instr.target, result);
		return voidVal();
	} catch (e) {
		return errorVal(ErrorCodes.DomainError, String(e));
	}
}

export function execOp(
	instr: { kind: "op"; target: string; ns: string; name: string; args: string[] },
	ctx: AsyncEvalContext,
): Value {
	return executeOp(instr, ctx);
}

//==============================================================================
// execSpawn - helpers
//==============================================================================

function collectSpawnArgs(
	args: string[] | undefined,
	ctx: AsyncEvalContext,
): { values: Value[]; error?: Value } {
	const values: Value[] = [];
	if (!args) return { values };
	for (const argId of args) {
		const value = ctx.nodeValues.get(argId);
		if (!value) {
			return { values, error: errorVal(ErrorCodes.UnboundIdentifier, `Spawn arg not found: ${argId}`) };
		}
		values.push(value);
	}
	return { values };
}

function buildSpawnEnv(
	args: string[] | undefined,
	collected: { values: Value[] },
	ctx: AsyncEvalContext,
): import("../env.js").ValueEnv {
	return extendValueEnvMany(
		ctx.state.env,
		args
			? args
				.map((argId, i): [string, Value | undefined] => [argId, collected.values[i]])
				.filter((pair): pair is [string, Value] => pair[1] !== undefined)
			: [],
	);
}

interface SpawnInput {
	taskId: string;
	entryNode: import("../types.js").PirHybridNode;
	taskEnv: import("../env.js").ValueEnv;
}

function spawnTask(input: SpawnInput, ctx: AsyncEvalContext): void {
	const { taskId, entryNode, taskEnv } = input;
	ctx.state.scheduler.spawn(taskId, async () => {
		try {
			if (isBlockNode(entryNode)) {
				const taskCtx: AsyncEvalContext = {
					...ctx,
					state: { ...ctx.state, env: taskEnv, taskId },
				};
				return (await ctx.svc.evalBlockNode(entryNode, taskCtx)).value;
			}
			return await ctx.svc.evalExpr(entryNode.expr, taskEnv, ctx);
		} catch (error) {
			return errorVal(ErrorCodes.DomainError, `Spawn task error: ${String(error)}`);
		}
	});
}

//==============================================================================
// execSpawn
//==============================================================================

function prepareSpawn(
	instr: { entry: string; args?: string[] | undefined },
	ctx: AsyncEvalContext,
): SpawnInput | { error: Value } {
	const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	const entryNode = ctx.nodeMap.get(instr.entry);
	if (!entryNode) {
		return { error: errorVal(ErrorCodes.UnboundIdentifier, `Spawn entry block not found: ${instr.entry}`) };
	}
	const collected = collectSpawnArgs(instr.args, ctx);
	if (collected.error) return { error: collected.error };
	const taskEnv = buildSpawnEnv(instr.args, collected, ctx);
	return { taskId, entryNode, taskEnv };
}

export function execSpawn(
	instr: { kind: "spawn"; target: string; entry: string; args?: string[] | undefined },
	ctx: AsyncEvalContext,
): Value {
	const prepared = prepareSpawn(instr, ctx);
	if ("error" in prepared) return prepared.error;
	spawnTask(prepared, ctx);
	const future = futureVal(prepared.taskId, "pending");
	ctx.state.refCells.set(instr.target, { kind: "refCell", value: future });
	return voidVal();
}

//==============================================================================
// execChannelOp
//==============================================================================

async function execChannelSend(instr: PirInsChannelOp, ctx: AsyncEvalContext, channelId: string): Promise<Value> {
	const channel = getChannels(ctx.state).get(channelId);
	if (!channel) return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelId}`);
	const value = instr.value ? ctx.nodeValues.get(instr.value) : voidVal();
	if (!value) return errorVal(ErrorCodes.DomainError, `Value not found: ${instr.value}`);
	await channel.send(value);
	return voidVal();
}

async function execChannelRecv(instr: PirInsChannelOp, ctx: AsyncEvalContext, channelId: string): Promise<Value> {
	const channel = getChannels(ctx.state).get(channelId);
	if (!channel) return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelId}`);
	const received = await channel.recv();
	if (instr.target) {
		ctx.state.refCells.set(instr.target, { kind: "refCell", value: received });
	}
	return voidVal();
}

export async function execChannelOp(instr: PirInsChannelOp, ctx: AsyncEvalContext): Promise<Value> {
	const channelValue = ctx.nodeValues.get(instr.channel);
	if (!channelValue || !isChannel(channelValue)) {
		return errorVal(ErrorCodes.TypeError, "channelOp requires a Channel value");
	}
	if (instr.op === "send") return execChannelSend(instr, ctx, channelValue.id);
	if (instr.op === "recv") return execChannelRecv(instr, ctx, channelValue.id);
	return errorVal(ErrorCodes.UnknownOperator, `Unknown channelOp: ${instr.op}`);
}

//==============================================================================
// execAwait
//==============================================================================

export async function execAwait(
	instr: { kind: "await"; target: string; future: string },
	ctx: AsyncEvalContext,
): Promise<Value> {
	const futureValue = ctx.nodeValues.get(instr.future);
	if (!futureValue || !isFuture(futureValue)) {
		return errorVal(ErrorCodes.TypeError, "await requires a Future value");
	}
	const result = await ctx.state.scheduler.await(futureValue.taskId);
	updateRefCell(instr.target, result, ctx);
	return voidVal();
}
