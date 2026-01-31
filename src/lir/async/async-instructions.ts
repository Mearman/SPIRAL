// SPIRAL LIR Async Evaluator - Async Instruction Handlers

import { ErrorCodes } from "../../errors.js";
import { lookupValue } from "../../env.js";
import type {
	EirInsSpawn,
	EirInsChannelOp,
	EirInsAwait,
	Value,
} from "../../types.js";
import {
	errorVal,
	intVal,
	isChannel,
	isFuture,
	voidVal,
	futureVal,
} from "../../types.js";
import type { LIRAsyncRuntimeState } from "./types.js";
import { bindVar } from "./instruction-handlers.js";

//==============================================================================
// Spawn Instruction
//==============================================================================

/**
 * Execute a spawn instruction: creates a new async task
 */
export function executeSpawnInstruction(
	ins: EirInsSpawn,
	state: LIRAsyncRuntimeState,
): Value | undefined {
	const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	if (ins.args) {
		for (const argId of ins.args) {
			const value = lookupValue(state.vars, argId);
			if (!value) {
				return errorVal(ErrorCodes.UnboundIdentifier, `Spawn arg not found: ${argId}`);
			}
		}
	}

	state.scheduler.spawn(taskId, () => Promise.resolve(voidVal()));
	const future = futureVal(taskId, "pending");
	bindVar(state, ins.target, future);
	return undefined;
}

//==============================================================================
// Channel Operation - Sub-handlers
//==============================================================================

async function handleChannelSend(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
	channel: { send: (v: Value) => Promise<void> },
): Promise<Value | undefined> {
	const value = ins.value ? lookupValue(state.vars, ins.value) : voidVal();
	if (!value && ins.value) {
		return errorVal(ErrorCodes.DomainError, `Value not found: ${ins.value}`);
	}
	await channel.send(value ?? voidVal());
	return undefined;
}

function handleChannelRecv(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
	received: Value,
): void {
	if (ins.target) {
		bindVar(state, ins.target, received);
	}
}

function handleChannelTrySend(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
	channel: { trySend: (v: Value) => boolean },
): Value | undefined {
	const value = ins.value ? lookupValue(state.vars, ins.value) : voidVal();
	if (!value && ins.value) {
		return errorVal(ErrorCodes.DomainError, `Value not found: ${ins.value}`);
	}
	const success = channel.trySend(value ?? voidVal());
	if (ins.target) {
		bindVar(state, ins.target, intVal(success ? 1 : 0));
	}
	return undefined;
}

function handleChannelTryRecv(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
	result: Value | null,
): void {
	if (!ins.target) {
		return;
	}
	const value = result ?? voidVal();
	bindVar(state, ins.target, value);
}

//==============================================================================
// Channel Operation Instruction
//==============================================================================

function resolveChannel(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
): ReturnType<LIRAsyncRuntimeState["channels"]["get"]> | Value {
	const channelValue = lookupValue(state.vars, ins.channel);
	if (!channelValue || !isChannel(channelValue)) {
		return errorVal(ErrorCodes.TypeError, "channelOp requires a Channel value");
	}
	const channel = state.channels.get(channelValue.id);
	if (!channel) {
		return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
	}
	return channel;
}

/**
 * Execute a channel operation instruction: send/recv/trySend/tryRecv
 */
export async function executeChannelOpInstruction(
	ins: EirInsChannelOp,
	state: LIRAsyncRuntimeState,
): Promise<Value | undefined> {
	const resolved = resolveChannel(ins, state);
	if (!resolved || "kind" in resolved) {
		return resolved ?? undefined;
	}

	switch (ins.op) {
	case "send":
		return handleChannelSend(ins, state, resolved);
	case "recv": {
		handleChannelRecv(ins, state, await resolved.recv());
		return undefined;
	}
	case "trySend":
		return handleChannelTrySend(ins, state, resolved);
	case "tryRecv": {
		handleChannelTryRecv(ins, state, resolved.tryRecv());
		return undefined;
	}
	default:
		return errorVal(ErrorCodes.UnknownOperator, `Unknown channelOp: ${String(ins.op)}`);
	}
}

//==============================================================================
// Await Instruction
//==============================================================================

/**
 * Execute an await instruction: wait for a future and store result
 */
export async function executeAwaitInstruction(
	ins: EirInsAwait,
	state: LIRAsyncRuntimeState,
): Promise<Value | undefined> {
	const futureValue = lookupValue(state.vars, ins.future);
	if (!futureValue || !isFuture(futureValue)) {
		return errorVal(ErrorCodes.TypeError, "await requires a Future value");
	}

	const result = await state.scheduler.await(futureValue.taskId);
	bindVar(state, ins.target, result);
	return undefined;
}
