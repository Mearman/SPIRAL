// LIR instruction handlers

import { SPIRALError, ErrorCodes, exhaustive } from "../errors.js";
import { extendValueEnv, lookupValue } from "../env.js";
import { lookupOperator } from "../domains/registry.js";
import { lookupEffect } from "../effects.js";
import type {
	LirInsAssign,
	LirInsAssignRef,
	LirInsCall,
	LirInsEffect,
	LirInsOp,
	LirInsPhi,
	LirInstruction,
	Value,
} from "../types.js";
import { errorVal } from "../types.js";
import type { ExecContext, LIRRuntimeState } from "./exec-context.js";
import { evaluateExpr, resolveArgs } from "./expr.js";

function handleAssign(
	ins: LirInsAssign,
	state: LIRRuntimeState,
): Value | undefined {
	const value = evaluateExpr(ins.value, state.vars);
	if (value.kind === "error") {
		return value;
	}
	state.vars = extendValueEnv(state.vars, ins.target, value);
	return undefined;
}

function handleCall(
	ins: LirInsCall,
	state: LIRRuntimeState,
): Value | undefined {
	const args = resolveArgs(ins.args, state);
	if (!Array.isArray(args)) {
		return args;
	}
	state.vars = extendValueEnv(
		state.vars,
		ins.target,
		errorVal(ErrorCodes.DomainError, "Call not yet implemented in LIR"),
	);
	return undefined;
}

function catchSpiralError(e: unknown): Value {
	if (e instanceof SPIRALError) return e.toValue();
	return errorVal(ErrorCodes.DomainError, String(e));
}

function resolveOp(
	ins: LirInsOp,
	ctx: ExecContext,
	args: Value[],
): Value | undefined {
	const op = lookupOperator(ctx.registry, ins.ns, ins.name);
	if (!op) {
		return errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + ins.ns + ":" + ins.name);
	}
	if (op.params.length !== args.length) {
		return errorVal(
			ErrorCodes.ArityError,
			`Operator ${ins.ns}:${ins.name} expects ${op.params.length} args, got ${args.length}`,
		);
	}
	const result = safeCall(op.fn, args);
	if (result.kind === "error") return result;
	ctx.state.vars = extendValueEnv(ctx.state.vars, ins.target, result);
	return undefined;
}

function safeCall(
	fn: (...opArgs: Value[]) => Value,
	args: Value[],
): Value {
	try {
		return fn(...args);
	} catch (e) {
		return catchSpiralError(e);
	}
}

function handleOp(
	ins: LirInsOp,
	ctx: ExecContext,
): Value | undefined {
	const args = resolveArgs(ins.args, ctx.state);
	if (!Array.isArray(args)) return args;
	return resolveOp(ins, ctx, args);
}

function resolvePhiFromPredecessor(
	ins: LirInsPhi,
	state: LIRRuntimeState,
): Value | undefined {
	for (const source of ins.sources) {
		if (source.block === state.predecessor) {
			const value = lookupValue(state.vars, source.id);
			if (value && value.kind !== "error") {
				return value;
			}
		}
	}
	return undefined;
}

function resolvePhiFallback(
	ins: LirInsPhi,
	state: LIRRuntimeState,
): Value | undefined {
	for (const source of ins.sources) {
		const value = lookupValue(state.vars, source.id);
		if (value && value.kind !== "error") {
			return value;
		}
	}
	return undefined;
}

function handlePhi(
	ins: LirInsPhi,
	state: LIRRuntimeState,
): Value | undefined {
	const fromPred = state.predecessor
		? resolvePhiFromPredecessor(ins, state)
		: undefined;
	const phiValue = fromPred ?? resolvePhiFallback(ins, state);
	if (!phiValue) {
		return errorVal(
			ErrorCodes.DomainError,
			"Phi node has no valid sources: " + ins.target,
		);
	}
	state.vars = extendValueEnv(state.vars, ins.target, phiValue);
	return undefined;
}

function validateEffectOp(
	ins: LirInsEffect,
	ctx: ExecContext,
	args: Value[],
): Value | undefined {
	const effectOp = lookupEffect(ctx.effectRegistry, ins.op);
	if (!effectOp) {
		return errorVal(ErrorCodes.UnknownOperator, "Unknown effect operation: " + ins.op);
	}
	if (effectOp.params.length !== args.length) {
		return errorVal(
			ErrorCodes.ArityError,
			`Effect ${ins.op} expects ${effectOp.params.length} args, got ${args.length}`,
		);
	}
	return undefined;
}

function runEffectOp(
	ins: LirInsEffect,
	ctx: ExecContext,
	args: Value[],
): Value | undefined {
	const effectOp = lookupEffect(ctx.effectRegistry, ins.op);
	if (!effectOp) return undefined;
	ctx.state.effects.push({ op: ins.op, args });
	const result = safeCall(effectOp.fn, args);
	if (result.kind === "error") return result;
	if (ins.target) ctx.state.vars = extendValueEnv(ctx.state.vars, ins.target, result);
	return undefined;
}

function handleEffect(
	ins: LirInsEffect,
	ctx: ExecContext,
): Value | undefined {
	const args = resolveArgs(ins.args, ctx.state);
	if (!Array.isArray(args)) return args;
	return validateEffectOp(ins, ctx, args) ?? runEffectOp(ins, ctx, args);
}

function handleAssignRef(
	ins: LirInsAssignRef,
	state: LIRRuntimeState,
): Value | undefined {
	const value = lookupValue(state.vars, ins.value);
	if (!value) {
		return errorVal(
			ErrorCodes.UnboundIdentifier,
			"Value not found: " + ins.value,
		);
	}
	if (value.kind === "error") {
		return value;
	}
	const refCellId = ins.target + "_ref";
	state.vars.set(refCellId, value);
	return undefined;
}

export function executeInstruction(
	ins: LirInstruction,
	ctx: ExecContext,
): Value | undefined {
	switch (ins.kind) {
	case "assign":
		return handleAssign(ins, ctx.state);
	case "call":
		return handleCall(ins, ctx.state);
	case "op":
		return handleOp(ins, ctx);
	case "phi":
		return handlePhi(ins, ctx.state);
	case "effect":
		return handleEffect(ins, ctx);
	case "assignRef":
		return handleAssignRef(ins, ctx.state);
	default:
		return exhaustive(ins);
	}
}
