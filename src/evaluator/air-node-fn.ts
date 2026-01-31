// Complex evalNode case handlers: callExpr, fix, airRef

import {
	type ValueEnv,
	emptyValueEnv,
	extendValueEnv,
	lookupDef,
	lookupValue,
} from "../env.js";
import { SPIRALError, ErrorCodes } from "../errors.js";
import {
	type ClosureVal,
	type Expr,
	type Value,
} from "../types.js";
import { errorVal, isError } from "../types.js";
import type { NodeEvalResult } from "./types.js";
import type { ProgramCtx } from "./air-program.js";
import { applyOperator, type OpCall, Evaluator } from "./helpers.js";
import { evalExprWithNodeMap, evalExprInline, buildClosureEnv } from "./air-expr.js";

//==============================================================================
// evalNodeCallExpr
//==============================================================================

export function evalNodeCallExpr(
	ctx: ProgramCtx,
	expr: Expr & { kind: "callExpr" },
	env: ValueEnv,
): NodeEvalResult {
	const fnValue = ctx.nodeValues.get(expr.fn) ?? lookupValue(env, expr.fn);
	if (!fnValue) return errResult("Function node not evaluated: " + expr.fn, env);
	if (isError(fnValue)) return { value: fnValue, env };
	if (fnValue.kind !== "closure") return errResult("Expected closure, got: " + fnValue.kind, env, ErrorCodes.TypeError);
	const argValues = resolveCallExprArgs(ctx, expr.args, env);
	if (!Array.isArray(argValues)) return { value: argValues, env };
	return applyClosureForCallExpr({ ctx, fnValue, env }, argValues);
}

function resolveSingleCallExprArg(ctx: ProgramCtx, arg: string | Expr, env: ValueEnv): Value {
	if (typeof arg !== "string") return evalExprInline(ctx, arg, env);
	const val = ctx.nodeValues.get(arg) ?? lookupValue(env, arg);
	if (!val) return errorVal(ErrorCodes.DomainError, "Argument node not evaluated: " + arg);
	return val;
}

function resolveCallExprArgs(
	ctx: ProgramCtx,
	args: (string | Expr)[],
	env: ValueEnv,
): Value[] | Value {
	const values: Value[] = [];
	for (const arg of args) {
		const val = resolveSingleCallExprArg(ctx, arg, env);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

interface ClosureApplyCtx {
	ctx: ProgramCtx;
	fnValue: ClosureVal;
	env: ValueEnv;
}

function applyClosureForCallExpr(cc: ClosureApplyCtx, argValues: Value[]): NodeEvalResult {
	if (argValues.length > cc.fnValue.params.length) {
		return errResult("Arity error in callExpr: too many arguments", cc.env, ErrorCodes.ArityError);
	}
	const minArity = cc.fnValue.params.filter(p => !p.optional).length;
	if (argValues.length < minArity) {
		return errResult(`Arity error: expected at least ${minArity} args, got ${argValues.length}`, cc.env, ErrorCodes.ArityError);
	}
	const envResult = buildClosureEnv(cc.ctx, cc.fnValue, argValues);
	if ("kind" in envResult) return { value: envResult, env: cc.env };
	if (cc.fnValue.body.kind === "call") {
		return evalClosureCallBody({ ctx: cc.ctx, callEnv: envResult, outerEnv: cc.env }, cc.fnValue.body);
	}
	return { value: evalExprWithNodeMap(cc.ctx, cc.fnValue.body, envResult), env: cc.env };
}

interface CallBodyCtx {
	ctx: ProgramCtx;
	callEnv: ValueEnv;
	outerEnv: ValueEnv;
}

function evalClosureCallBody(bc: CallBodyCtx, body: Expr & { kind: "call" }): NodeEvalResult {
	const args = resolveClosureCallArgs(bc, body.args);
	if (!Array.isArray(args)) return { value: args, env: bc.outerEnv };
	const op: OpCall = { registry: bc.ctx.registry, ns: body.ns, name: body.name };
	try {
		return { value: applyOperator(op, args), env: bc.outerEnv };
	} catch (e) {
		if (e instanceof SPIRALError) return { value: e.toValue(), env: bc.outerEnv };
		return { value: errorVal(ErrorCodes.DomainError, String(e)), env: bc.outerEnv };
	}
}

function resolveClosureCallArgs(bc: CallBodyCtx, args: (string | Expr)[]): Value[] | Value {
	const values: Value[] = [];
	for (const arg of args) {
		if (typeof arg !== "string") return errVal("Expected string argument in call expression");
		const val = lookupValue(bc.callEnv, arg) ?? bc.ctx.nodeValues.get(arg);
		if (!val) return errVal("Argument not found: " + arg);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

//==============================================================================
// evalNodeFix
//==============================================================================

export function evalNodeFix(
	ctx: ProgramCtx,
	expr: Expr & { kind: "fix" },
	env: ValueEnv,
): NodeEvalResult {
	const fnValue = ctx.nodeValues.get(expr.fn);
	if (!fnValue) return errResult("Function node not evaluated: " + expr.fn, env);
	if (isError(fnValue)) return { value: fnValue, env };
	if (fnValue.kind !== "closure") return errResult("Expected closure, got: " + fnValue.kind, env, ErrorCodes.TypeError);
	if (fnValue.params.length !== 1) return errResult("Fix requires single-parameter function", env, ErrorCodes.ArityError);
	const firstParam = fnValue.params[0];
	if (firstParam === undefined) return errResult("fix requires a function with at least one parameter", env, ErrorCodes.ArityError);
	return buildFixedPoint({ ctx, env }, fnValue, firstParam.name);
}

interface FixCtx {
	ctx: ProgramCtx;
	env: ValueEnv;
}

function buildFixedPoint(fc: FixCtx, fnValue: ClosureVal, param: string): NodeEvalResult {
	const selfRef: ClosureVal = { kind: "closure", params: [], body: fnValue.body, env: fnValue.env };
	const fixEnv = extendValueEnv(fnValue.env, param, selfRef);
	const innerResult = evalExprWithNodeMap(fc.ctx, fnValue.body, fixEnv);
	if (isError(innerResult)) return { value: innerResult, env: fc.env };
	if (innerResult.kind !== "closure") {
		return errResult("Fix body should evaluate to closure, got: " + innerResult.kind, fc.env, ErrorCodes.TypeError);
	}
	selfRef.params = innerResult.params;
	selfRef.body = innerResult.body;
	selfRef.env = extendValueEnv(innerResult.env, param, selfRef);
	return { value: selfRef, env: fc.env };
}

//==============================================================================
// evalNodeAirRef
//==============================================================================

export function evalNodeAirRef(
	ctx: ProgramCtx,
	expr: Expr & { kind: "airRef" },
	env: ValueEnv,
): NodeEvalResult {
	const def = lookupDef(ctx.defs, expr.ns, expr.name);
	if (!def) return errResult("Unknown definition: " + expr.ns + ":" + expr.name, env, ErrorCodes.UnknownDefinition);
	if (def.params.length !== expr.args.length) {
		return errResult("Arity error for airDef: " + expr.ns + ":" + expr.name, env, ErrorCodes.ArityError);
	}
	const argValues = resolveAirRefArgs(ctx, expr.args);
	if (!Array.isArray(argValues)) return { value: argValues, env };
	return evalAirDefBody({ ctx, env }, def, argValues);
}

function resolveAirRefArgs(ctx: ProgramCtx, args: string[]): Value[] | Value {
	const values: Value[] = [];
	for (const argId of args) {
		const val = ctx.nodeValues.get(argId);
		if (!val) return errVal("Argument node not evaluated: " + argId);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

interface DefCtx {
	ctx: ProgramCtx;
	env: ValueEnv;
}

function evalAirDefBody(dc: DefCtx, def: { params: string[]; body: Expr }, argValues: Value[]): NodeEvalResult {
	const defEnv = buildDefEnv(def.params, argValues);
	if ("kind" in defEnv) return { value: defEnv, env: dc.env };
	if (def.body.kind === "call") {
		return evalAirDefCallBody(dc, def.body, defEnv);
	}
	const state = { steps: 0, maxSteps: dc.ctx.options?.maxSteps ?? 10000, trace: dc.ctx.options?.trace ?? false };
	const defEvaluator = new Evaluator(dc.ctx.registry, dc.ctx.defs);
	return { value: defEvaluator.evaluateWithState(def.body, defEnv, state), env: dc.env };
}

function buildDefEnv(params: string[], argValues: Value[]): ValueEnv | Value {
	let defEnv = emptyValueEnv();
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		const argValue = argValues[i];
		if (param === undefined || argValue === undefined) {
			return errorVal(ErrorCodes.ValidationError, `Parameter at index ${i} is undefined`);
		}
		defEnv = extendValueEnv(defEnv, param, argValue);
	}
	return defEnv;
}

function evalAirDefCallBody(dc: DefCtx, callExpr: Expr & { kind: "call" }, defEnv: ValueEnv): NodeEvalResult {
	const args = resolveAirDefCallArgs(dc.ctx, callExpr.args, defEnv);
	if (!Array.isArray(args)) return { value: args, env: dc.env };
	const op: OpCall = { registry: dc.ctx.registry, ns: callExpr.ns, name: callExpr.name };
	try {
		return { value: applyOperator(op, args), env: dc.env };
	} catch (e) {
		if (e instanceof SPIRALError) return { value: e.toValue(), env: dc.env };
		return { value: errorVal(ErrorCodes.DomainError, String(e)), env: dc.env };
	}
}

function resolveAirDefCallArgs(
	ctx: ProgramCtx,
	args: (string | Expr)[],
	defEnv: ValueEnv,
): Value[] | Value {
	const values: Value[] = [];
	for (const arg of args) {
		let val: Value | undefined;
		if (typeof arg === "string") {
			val = lookupValue(defEnv, arg) ?? ctx.nodeValues.get(arg);
			if (!val) return errVal("Argument not found: " + arg);
		} else {
			val = evalExprInline(ctx, arg, defEnv);
		}
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

//==============================================================================
// Helpers
//==============================================================================

function errVal(msg: string): Value {
	return errorVal(ErrorCodes.DomainError, msg);
}

function errResult(msg: string, env: ValueEnv, code?: string): NodeEvalResult {
	return { value: errorVal(code ?? ErrorCodes.DomainError, msg), env };
}
