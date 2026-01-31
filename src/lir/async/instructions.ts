// SPIRAL LIR Async Evaluator - Instruction Dispatch

import { ErrorCodes, exhaustive } from "../../errors.js";
import type { LirInstruction, EirInstruction, Value } from "../../types.js";
import { errorVal } from "../../types.js";
import type { InstructionContext } from "./types.js";
import {
	handleAssign,
	handleCall,
	handleOp,
	handlePhi,
	handleEffect,
	handleAssignRef,
} from "./instruction-handlers.js";
import {
	executeSpawnInstruction,
	executeChannelOpInstruction,
	executeAwaitInstruction,
} from "./async-instructions.js";

// Re-export async instruction handlers for public API
export {
	executeSpawnInstruction,
	executeChannelOpInstruction,
	executeAwaitInstruction,
} from "./async-instructions.js";

//==============================================================================
// Instruction Dispatch
//==============================================================================

function dispatchLirInstruction(
	ins: LirInstruction,
	ctx: InstructionContext,
): Value | undefined {
	switch (ins.kind) {
	case "assign":
		return handleAssign(ins.target, ins.value, ctx);
	case "call":
		return handleCall(ins.target, ins.args, ctx);
	case "op":
		return handleOp({ ns: ins.ns, name: ins.name, target: ins.target, args: ins.args }, ctx);
	case "phi":
		return handlePhi(ins.target, ins.sources, ctx);
	case "effect":
		return handleEffect({ op: ins.op, args: ins.args, target: ins.target }, ctx);
	case "assignRef":
		return handleAssignRef(ins.target, ins.value, ctx);
	default:
		return exhaustive(ins);
	}
}

function dispatchAsyncInstruction(
	ins: LirInstruction | EirInstruction,
	ctx: InstructionContext,
): Promise<Value | undefined> | Value | undefined {
	switch (ins.kind) {
	case "spawn":
		return executeSpawnInstruction(ins, ctx.state);
	case "channelOp":
		return executeChannelOpInstruction(ins, ctx.state);
	case "await":
		return executeAwaitInstruction(ins, ctx.state);
	default:
		return dispatchLirInstruction(ins, ctx);
	}
}

/**
 * Execute a single LIR instruction (async version).
 * Returns undefined on success, or an error Value on failure.
 */
export async function executeInstructionAsync(
	ins: LirInstruction | EirInstruction,
	ctx: InstructionContext,
): Promise<Value | undefined> {
	return dispatchAsyncInstruction(ins, ctx);
}

//==============================================================================
// Block Execution
//==============================================================================

/**
 * Execute all instructions in a basic block (async version).
 * Returns undefined on success, or an error Value on failure.
 */
export async function executeBlockAsync(
	block: { instructions: (LirInstruction | EirInstruction)[] },
	ctx: InstructionContext,
): Promise<Value | undefined> {
	for (const ins of block.instructions) {
		ctx.state.steps++;
		if (ctx.state.steps > ctx.state.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block async execution exceeded maximum steps");
		}

		const result = await executeInstructionAsync(ins, ctx);
		if (result) {
			return result;
		}
	}
	return undefined;
}
