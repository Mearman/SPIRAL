// Complex evalNode case handlers: callExpr, fix

import {
	type ValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.ts";
import { SPIRALError, ErrorCodes } from "../errors.ts";
import {
	type ClosureVal,
	type Expr,
	type Value,
} from "../types.ts";
import { errorVal, isError } from "../types.ts";
import type { NodeEvalResult } from "./types.ts";
import type { ProgramCtx } from "./air-program.ts";
import { applyOperator, type OpCall } from "./helpers.ts";
import { evalExprWithNodeMap, evalExprInline, buildClosureEnv } from "./air-expr.ts";

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
// Helpers
//==============================================================================

function errVal(msg: string): Value {
	return errorVal(ErrorCodes.DomainError, msg);
}

function errResult(msg: string, env: ValueEnv, code?: string): NodeEvalResult {
	return { value: errorVal(code ?? ErrorCodes.DomainError, msg), env };
}
