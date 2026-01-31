// EIR Expression Handlers

import { lookupOperator } from "../domains/registry.js";
import {
	type ValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type Value,
	type Type,
	voidVal,
	errorVal,
	isError,
} from "../types.js";
import {
	boolVal as boolValCtor,
	closureVal,
	floatVal,
	intVal as intValCtor,
	opaqueVal,
	stringVal as stringValCtor,
	undefinedVal,
} from "../types.js";
import type { AsyncEvalContext } from "./types.js";
import type { Expr, LambdaParam } from "../types.js";

// Re-export control flow handlers
export {
	evalWhile,
	evalFor,
	evalIter,
	evalEffect,
	evalRefCellExpr,
	evalRefExpr,
	evalTryExpr,
} from "./eir-control.js";

//==============================================================================
// Literal
//==============================================================================

export function evalLit(expr: { kind: "lit"; type: Type; value: unknown }): Value {
	switch (expr.type.kind) {
	case "bool":
		return boolValCtor(!!expr.value);
	case "int":
		return intValCtor(Number(expr.value));
	case "float":
		return floatVal(Number(expr.value));
	case "string":
		return stringValCtor(String(expr.value));
	case "void":
		return voidVal();
	default:
		return opaqueVal(expr.type.kind, expr.value);
	}
}

//==============================================================================
// Variable
//==============================================================================

export function evalVar(
	expr: { kind: "var"; name: string },
	env: ValueEnv,
	ctx?: AsyncEvalContext,
): Value {
	const value = lookupValue(env, expr.name);
	if (value) return value;

	if (ctx) {
		const nodeValue = ctx.nodeValues.get(expr.name);
		if (nodeValue && !isError(nodeValue)) return nodeValue;
	}

	return errorVal(ErrorCodes.UnboundIdentifier, `Unbound variable: ${expr.name}`);
}

//==============================================================================
// Call (operator call)
//==============================================================================

async function resolveCallArgs(
	args: (string | Expr)[],
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value[]> {
	const argValues: Value[] = [];
	for (const arg of args) {
		argValues.push(await ctx.svc.resolveNodeRef(arg, env, ctx));
	}
	return argValues;
}

export async function evalCall(
	expr: { kind: "call"; ns: string; name: string; args: (string | Expr)[] },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const argValues = await resolveCallArgs(expr.args, env, ctx);
	const op = lookupOperator(ctx.svc.registry, expr.ns, expr.name);
	if (!op) {
		return errorVal(ErrorCodes.UnknownOperator, `Unknown operator: ${expr.ns}.${expr.name}`);
	}
	try {
		return op.fn(...argValues);
	} catch (e) {
		return errorVal(ErrorCodes.DomainError, String(e));
	}
}

//==============================================================================
// If
//==============================================================================

export async function evalIf(
	expr: { kind: "if"; cond: string | Expr; then: string | Expr; else: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const condValue = await ctx.svc.resolveNodeRef(expr.cond, env, ctx);
	if (condValue.kind !== "bool") {
		return errorVal(ErrorCodes.TypeError, "if condition must be boolean");
	}
	return ctx.svc.resolveNodeRef(condValue.value ? expr.then : expr.else, env, ctx);
}

//==============================================================================
// Let
//==============================================================================

export async function evalLet(
	expr: { kind: "let"; name: string; value: string | Expr; body: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const value = await ctx.svc.resolveNodeRef(expr.value, env, ctx);
	const newEnv = extendValueEnv(env, expr.name, value);
	return ctx.svc.resolveNodeRef(expr.body, newEnv, ctx);
}

//==============================================================================
// Lambda
//==============================================================================

export function evalLambda(
	expr: { kind: "lambda"; params: (string | LambdaParam)[]; body: string },
	env: ValueEnv,
): Value {
	const lambdaParams: LambdaParam[] = expr.params.map(p =>
		typeof p === "string" ? { name: p } : p
	);
	return closureVal(lambdaParams, { kind: "ref", id: expr.body }, env);
}

//==============================================================================
// CallExpr (closure application) - helpers
//==============================================================================

function checkArity(params: LambdaParam[], argCount: number): Value | null {
	let minArity = 0;
	for (const param of params) {
		if (!param.optional) minArity++;
	}
	if (argCount < minArity) {
		return errorVal(ErrorCodes.ArityError, `Arity error: expected at least ${minArity} args, got ${argCount}`);
	}
	if (argCount > params.length) {
		return errorVal(ErrorCodes.ArityError, `Arity error: expected at most ${params.length} args, got ${argCount}`);
	}
	return null;
}

interface BindParamInput {
	param: LambdaParam;
	argValue: Value | undefined;
	closureEnv: ValueEnv;
}

async function bindParam(
	input: BindParamInput,
	ctx: AsyncEvalContext,
): Promise<{ name: string; value: Value } | { error: Value }> {
	const { param, argValue, closureEnv } = input;
	if (argValue !== undefined) {
		return { name: param.name, value: argValue };
	}
	if (param.optional) {
		if (param.default !== undefined) {
			const defaultVal = await ctx.svc.evalExpr(param.default, closureEnv, ctx);
			if (isError(defaultVal)) return { error: defaultVal };
			return { name: param.name, value: defaultVal };
		}
		return { name: param.name, value: undefinedVal() };
	}
	return { error: errorVal(ErrorCodes.ArityError, `Missing required parameter: ${param.name}`) };
}

interface BindAllInput {
	params: LambdaParam[];
	argValues: Value[];
	closureEnv: ValueEnv;
}

async function bindAllParams(
	input: BindAllInput,
	ctx: AsyncEvalContext,
): Promise<{ env: ValueEnv } | { error: Value }> {
	let env = input.closureEnv;
	for (let i = 0; i < input.params.length; i++) {
		const param = input.params[i];
		if (!param) break;
		const bound = await bindParam({ param, argValue: input.argValues[i], closureEnv: input.closureEnv }, ctx);
		if ("error" in bound) return { error: bound.error };
		env = extendValueEnv(env, bound.name, bound.value);
	}
	return { env };
}

//==============================================================================
// CallExpr (closure application)
//==============================================================================

async function prepareCallExpr(
	expr: { fn: string; args: (string | Expr)[] },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<{ fnValue: Value & { kind: "closure" }; argValues: Value[] } | { error: Value }> {
	const fnValue = await ctx.svc.resolveNodeRef(expr.fn, env, ctx);
	if (fnValue.kind !== "closure") {
		return { error: errorVal(ErrorCodes.TypeError, "callExpr requires a closure") };
	}
	const argValues = await resolveCallArgs(expr.args, env, ctx);
	const arityErr = checkArity(fnValue.params, argValues.length);
	if (arityErr) return { error: arityErr };
	return { fnValue, argValues };
}

export async function evalCallExpr(
	expr: { kind: "callExpr"; fn: string; args: (string | Expr)[] },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const prepared = await prepareCallExpr(expr, env, ctx);
	if ("error" in prepared) return prepared.error;

	const { fnValue, argValues } = prepared;
	const result = await bindAllParams({ params: fnValue.params, argValues, closureEnv: fnValue.env }, ctx);
	if ("error" in result) return result.error;

	if (fnValue.body.kind !== "ref") {
		return errorVal(ErrorCodes.TypeError, "callExpr closure body must be a ref expression");
	}
	return ctx.svc.resolveNodeRef(fnValue.body.id, result.env, ctx);
}

//==============================================================================
// Fix
//==============================================================================

export async function evalFix(
	expr: { kind: "fix"; fn: string },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const fnValue = await ctx.svc.resolveNodeRef(expr.fn, env, ctx);
	if (fnValue.kind !== "closure") {
		return errorVal(ErrorCodes.TypeError, "fix requires a closure");
	}

	const selfRef = closureVal(fnValue.params, fnValue.body, env);
	const firstParam = fnValue.params[0];
	const fixedEnv = extendValueEnv(env, firstParam ? firstParam.name : "self", selfRef);
	selfRef.env = fixedEnv;
	return selfRef;
}

//==============================================================================
// Seq
//==============================================================================

export async function evalSeq(
	expr: { kind: "seq"; first: string | Expr; then: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	await ctx.svc.resolveNodeRef(expr.first, env, ctx);
	return ctx.svc.resolveNodeRef(expr.then, env, ctx);
}

//==============================================================================
// Assign (expression form)
//==============================================================================

export async function evalAssignExpr(
	expr: { kind: "assign"; target: string; value: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const value = await ctx.svc.resolveNodeRef(expr.value, env, ctx);

	let cell = ctx.state.refCells.get(expr.target);
	if (cell?.kind === "refCell") {
		cell.value = value;
	} else {
		cell = { kind: "refCell", value };
		ctx.state.refCells.set(expr.target, cell);
	}

	return voidVal();
}
