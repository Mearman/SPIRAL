// EIR Async Expression Handlers: par, spawn, await, channel, send, recv, select, race

import { ErrorCodes } from "../errors.js";
import {
	type Value,
	voidVal,
	isFuture,
	isChannel,
	futureVal,
	channelVal,
	intVal,
	listVal,
	errorVal,
	isBlockNode,
	isError,
} from "../types.js";
import type {
	EirParExpr,
	EirSpawnExpr,
	EirAwaitExpr,
	EirChannelExpr,
	EirSendExpr,
	EirRecvExpr,
	AsyncEvalState,
} from "../types.js";
import { AsyncChannelStore } from "../async-effects.js";
import type { ValueEnv } from "../env.js";
import type { AsyncEvalContext } from "./types.js";

// Re-export select and race
export { evalSelectExpr, evalRaceExpr } from "./async-select.js";

//==============================================================================
// Channel helper
//==============================================================================

export function getChannels(state: AsyncEvalState): AsyncChannelStore {
	if (!(state.channels instanceof AsyncChannelStore)) {
		throw new Error("AsyncEvalState.channels must be an AsyncChannelStore instance");
	}
	return state.channels;
}

//==============================================================================
// Par
//==============================================================================

async function evalParBranch(
	branchId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const node = ctx.nodeMap.get(branchId);
	if (!node) {
		return errorVal(ErrorCodes.UnboundIdentifier, `Branch node not found: ${branchId}`);
	}
	if (isBlockNode(node)) {
		return (await ctx.svc.evalBlockNode(node, ctx)).value;
	}
	return ctx.svc.evalExpr(node.expr, env, ctx);
}

export async function evalPar(
	expr: EirParExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	if (ctx.concurrency === "sequential") {
		const results: Value[] = [];
		for (const branchId of expr.branches) {
			results.push(await evalParBranch(branchId, env, ctx));
		}
		return listVal(results);
	}
	const results = await Promise.all(
		expr.branches.map((id) => evalParBranch(id, env, ctx)),
	);
	return listVal(results);
}

//==============================================================================
// Spawn (expression form)
//==============================================================================

export function evalSpawnExpr(
	expr: EirSpawnExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Value {
	const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	const taskNode = ctx.nodeMap.get(expr.task);
	if (!taskNode) {
		return errorVal(ErrorCodes.UnboundIdentifier, `Spawn task node not found: ${expr.task}`);
	}
	const capturedEnv = new Map(env);
	ctx.state.scheduler.spawn(taskId, async () => {
		try {
			if (isBlockNode(taskNode)) {
				return (await ctx.svc.evalBlockNode(taskNode, ctx)).value;
			}
			return await ctx.svc.evalExpr(taskNode.expr, capturedEnv, ctx);
		} catch (error) {
			return errorVal(ErrorCodes.DomainError, `Task error: ${String(error)}`);
		}
	});
	return futureVal(taskId, "pending");
}

//==============================================================================
// Await - helpers
//==============================================================================

function wrapAwaitResult(value: Value, returnIndex: boolean | undefined, index: number): Value {
	if (returnIndex) return { kind: "selectResult", index, value };
	return value;
}

interface TimeoutInput {
	expr: EirAwaitExpr;
	env: ValueEnv;
	ctx: AsyncEvalContext;
}

function buildAwaitTimeoutPromise(input: TimeoutInput, timeoutMs: number): Promise<Value> {
	const { expr, env, ctx } = input;
	return new Promise<Value>((resolve) => {
		setTimeout(() => {
			if (expr.fallback) {
				ctx.svc.resolveNodeRef(expr.fallback, env, ctx)
					.then(resolve)
					.catch((err: unknown) => {
						resolve(err instanceof Error
							? errorVal(ErrorCodes.DomainError, err.message)
							: errorVal(ErrorCodes.DomainError, String(err)));
					});
			} else {
				resolve(errorVal(ErrorCodes.TimeoutError, "Await timed out"));
			}
		}, timeoutMs);
	});
}

async function resolveTimeoutMs(input: TimeoutInput): Promise<Value | number> {
	const { expr, env, ctx } = input;
	if (!expr.timeout) return -1;
	const timeoutValue = await ctx.svc.resolveNodeRef(expr.timeout, env, ctx);
	if (timeoutValue.kind !== "int") {
		return errorVal(ErrorCodes.TypeError, "await timeout must be an integer");
	}
	return timeoutValue.value;
}

async function evalAwaitWithTimeout(input: TimeoutInput, futureTaskId: string): Promise<Value> {
	const { expr, ctx } = input;
	const timeoutMs = await resolveTimeoutMs(input);
	if (typeof timeoutMs !== "number") return timeoutMs;
	if (timeoutMs < 0) {
		const result = await ctx.state.scheduler.await(futureTaskId);
		return wrapAwaitResult(result, expr.returnIndex, 0);
	}
	const result = await Promise.race([
		ctx.state.scheduler.await(futureTaskId),
		buildAwaitTimeoutPromise(input, timeoutMs),
	]);
	const isTimeout = isError(result) && result.code === ErrorCodes.TimeoutError;
	return wrapAwaitResult(result, expr.returnIndex, isTimeout ? 1 : 0);
}

//==============================================================================
// Await
//==============================================================================

function handleReadyFuture(futureValue: Value & { kind: "future" }, expr: EirAwaitExpr): Value | null {
	if (futureValue.status === "error") return errorVal(ErrorCodes.DomainError, "Future completed with error");
	if (futureValue.status === "ready") return wrapAwaitResult(futureValue.value ?? voidVal(), expr.returnIndex, 0);
	return null;
}

export async function evalAwaitExpr(
	expr: EirAwaitExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const futureValue = await ctx.svc.resolveNodeRef(expr.future, env, ctx);
	if (!isFuture(futureValue)) return errorVal(ErrorCodes.TypeError, "await requires a Future value");
	const earlyResult = handleReadyFuture(futureValue, expr);
	if (earlyResult) return earlyResult;
	if (expr.timeout) return evalAwaitWithTimeout({ expr, env, ctx }, futureValue.taskId);
	const result = await ctx.state.scheduler.await(futureValue.taskId);
	return wrapAwaitResult(result, expr.returnIndex, 0);
}

//==============================================================================
// Channel
//==============================================================================

export async function evalChannelExpr(
	expr: EirChannelExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const bufferSize = expr.bufferSize
		? await ctx.svc.resolveNodeRef(expr.bufferSize, env, ctx)
		: intVal(0);
	if (bufferSize.kind !== "int") {
		return errorVal(ErrorCodes.TypeError, "Channel buffer size must be an integer");
	}
	const channelId = getChannels(ctx.state).create(bufferSize.value);
	return channelVal(channelId, expr.channelType);
}

//==============================================================================
// Send
//==============================================================================

export async function evalSendExpr(
	expr: EirSendExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const channelValue = await ctx.svc.resolveNodeRef(expr.channel, env, ctx);
	const valueToSend = await ctx.svc.resolveNodeRef(expr.value, env, ctx);
	if (!isChannel(channelValue)) {
		return errorVal(ErrorCodes.TypeError, "send requires a Channel value");
	}
	const channel = getChannels(ctx.state).get(channelValue.id);
	if (!channel) {
		return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
	}
	await channel.send(valueToSend);
	return voidVal();
}

//==============================================================================
// Recv
//==============================================================================

export async function evalRecvExpr(
	expr: EirRecvExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const channelValue = await ctx.svc.resolveNodeRef(expr.channel, env, ctx);
	if (!isChannel(channelValue)) {
		return errorVal(ErrorCodes.TypeError, "recv requires a Channel value");
	}
	const channel = getChannels(ctx.state).get(channelValue.id);
	if (!channel) {
		return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
	}
	return channel.recv();
}
