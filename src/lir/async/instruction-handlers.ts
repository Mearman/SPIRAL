// SPIRAL LIR Async Evaluator - Base Instruction Handlers

import { SPIRALError, ErrorCodes } from "../../errors.js";
import { extendValueEnv, lookupValue } from "../../env.js";
import { lookupOperator } from "../../domains/registry.js";
import { lookupEffect } from "../../effects.js";
import type { Value } from "../../types.js";
import { errorVal } from "../../types.js";
import type { InstructionContext, LIRAsyncRuntimeState } from "./types.js";
import { evaluateExpr } from "./expr.js";

//==============================================================================
// Argument Resolution Helper
//==============================================================================

/** Resolve a list of argument IDs to values, returning error on failure. */
export function resolveArgs(
	argIds: string[],
	state: LIRAsyncRuntimeState,
): { values: Value[] } | { error: Value } {
	const values: Value[] = [];
	for (const argId of argIds) {
		const argValue = lookupValue(state.vars, argId);
		if (!argValue) {
			return { error: errorVal(ErrorCodes.UnboundIdentifier, "Argument not found: " + argId) };
		}
		if (argValue.kind === "error") {
			return { error: argValue };
		}
		values.push(argValue);
	}
	return { values };
}

/** Store a value in both vars and refCells. */
export function bindVar(
	state: LIRAsyncRuntimeState,
	target: string,
	value: Value,
): void {
	state.vars = extendValueEnv(state.vars, target, value);
	state.refCells.set(target, { kind: "refCell", value });
}

//==============================================================================
// Assign Handler
//==============================================================================

export function handleAssign(
	target: string,
	valueExpr: Parameters<typeof evaluateExpr>[0],
	ctx: InstructionContext,
): Value | undefined {
	const value = evaluateExpr(valueExpr, ctx.state.vars);
	if (value.kind === "error") {
		return value;
	}
	bindVar(ctx.state, target, value);
	return undefined;
}

//==============================================================================
// Call Handler
//==============================================================================

export function handleCall(
	target: string,
	args: string[],
	ctx: InstructionContext,
): Value | undefined {
	const resolved = resolveArgs(args, ctx.state);
	if ("error" in resolved) {
		return resolved.error;
	}
	ctx.state.vars = extendValueEnv(
		ctx.state.vars, target,
		errorVal(ErrorCodes.DomainError, "Call not yet implemented in LIR async"),
	);
	return undefined;
}

//==============================================================================
// Op Handler
//==============================================================================

interface OpDescriptor {
	ns: string;
	name: string;
	target: string;
	args: string[];
}

function executeOpCall(
	desc: OpDescriptor,
	argValues: Value[],
	ctx: InstructionContext,
): Value {
	const op = lookupOperator(ctx.registry, desc.ns, desc.name);
	if (!op) {
		return errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + desc.ns + ":" + desc.name);
	}
	if (op.params.length !== argValues.length) {
		return errorVal(
			ErrorCodes.ArityError,
			`Operator ${desc.ns}:${desc.name} expects ${op.params.length} args, got ${argValues.length}`,
		);
	}
	return safeFnCall(op.fn, argValues);
}

function safeFnCall(fn: (...args: Value[]) => Value, argValues: Value[]): Value {
	try {
		return fn(...argValues);
	} catch (e) {
		if (e instanceof SPIRALError) {
			return e.toValue();
		}
		return errorVal(ErrorCodes.DomainError, String(e));
	}
}

export function handleOp(
	desc: OpDescriptor,
	ctx: InstructionContext,
): Value | undefined {
	const resolved = resolveArgs(desc.args, ctx.state);
	if ("error" in resolved) {
		return resolved.error;
	}
	const result = executeOpCall(desc, resolved.values, ctx);
	if (result.kind === "error") {
		return result;
	}
	bindVar(ctx.state, desc.target, result);
	return undefined;
}

//==============================================================================
// Phi Handler
//==============================================================================

function findSourceByBlock(
	sources: { block: string; id: string }[],
	predecessor: string,
	vars: LIRAsyncRuntimeState["vars"],
): Value | undefined {
	for (const source of sources) {
		if (source.block === predecessor) {
			const value = lookupValue(vars, source.id);
			if (value && value.kind !== "error") {
				return value;
			}
		}
	}
	return undefined;
}

function findAnyValidSource(
	sources: { block: string; id: string }[],
	vars: LIRAsyncRuntimeState["vars"],
): Value | undefined {
	for (const source of sources) {
		const value = lookupValue(vars, source.id);
		if (value && value.kind !== "error") {
			return value;
		}
	}
	return undefined;
}

function resolvePhiValue(
	sources: { block: string; id: string }[],
	state: LIRAsyncRuntimeState,
): Value | undefined {
	if (state.predecessor) {
		const match = findSourceByBlock(sources, state.predecessor, state.vars);
		if (match) {
			return match;
		}
	}
	return findAnyValidSource(sources, state.vars);
}

export function handlePhi(
	target: string,
	sources: { block: string; id: string }[],
	ctx: InstructionContext,
): Value | undefined {
	const phiValue = resolvePhiValue(sources, ctx.state);
	if (!phiValue) {
		return errorVal(ErrorCodes.DomainError, "Phi node has no valid sources: " + target);
	}
	bindVar(ctx.state, target, phiValue);
	return undefined;
}

//==============================================================================
// Effect Handler
//==============================================================================

interface EffectDescriptor {
	op: string;
	args: string[];
	target: string | undefined;
}

function validateEffect(
	op: string,
	argValues: Value[],
	ctx: InstructionContext,
): { fn: (...a: Value[]) => Value } | Value {
	const effectOp = lookupEffect(ctx.effectRegistry, op);
	if (!effectOp) {
		return errorVal(ErrorCodes.UnknownOperator, "Unknown effect operation: " + op);
	}
	if (effectOp.params.length !== argValues.length) {
		return errorVal(
			ErrorCodes.ArityError,
			`Effect ${op} expects ${effectOp.params.length} args, got ${argValues.length}`,
		);
	}
	return effectOp;
}

function executeEffectCall(
	desc: EffectDescriptor,
	argValues: Value[],
	ctx: InstructionContext,
): Value {
	const validated = validateEffect(desc.op, argValues, ctx);
	if ("kind" in validated) {
		return validated;
	}
	ctx.state.effects.push({ op: desc.op, args: argValues });
	return safeFnCall(validated.fn, argValues);
}

export function handleEffect(
	desc: EffectDescriptor,
	ctx: InstructionContext,
): Value | undefined {
	const resolved = resolveArgs(desc.args, ctx.state);
	if ("error" in resolved) {
		return resolved.error;
	}
	const result = executeEffectCall(desc, resolved.values, ctx);
	if (result.kind === "error") {
		return result;
	}
	if (desc.target) {
		bindVar(ctx.state, desc.target, result);
	}
	return undefined;
}

//==============================================================================
// AssignRef Handler
//==============================================================================

export function handleAssignRef(
	target: string,
	valueId: string,
	ctx: InstructionContext,
): Value | undefined {
	const value = lookupValue(ctx.state.vars, valueId);
	if (!value) {
		return errorVal(ErrorCodes.UnboundIdentifier, "Value not found: " + valueId);
	}
	if (value.kind === "error") {
		return value;
	}
	ctx.state.refCells.set(target, { kind: "refCell", value });
	return undefined;
}
