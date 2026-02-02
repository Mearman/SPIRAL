// evalExprWithNodeMap + evalExprInline - evaluate expressions with node map access

import { lookupOperator } from "../domains/registry.js";
import {
	type ValueEnv,
	extendValueEnv,
	lookupDef,
	lookupValue,
} from "../env.js";
import { SPIRALError, ErrorCodes } from "../errors.js";
import {
	type AirHybridNode,
	type ClosureVal,
	type Expr,
	type LambdaParam,
	type Value,
	isBlockNode,
	voidVal,
	closureVal,
	undefinedVal,
	listVal,
	mapVal,
} from "../types.js";
import { errorVal, isError } from "../types.js";
import type { AirEvalCtx } from "./types.js";
import { evaluateBlockNode } from "./block-eval.js";
import { evalLitValue } from "./lit-eval.js";

//==============================================================================
// evalExprWithNodeMap - main dispatch
//==============================================================================

/** Evaluate an expression with access to nodeMap for resolving references. */
export function evalExprWithNodeMap(ctx: AirEvalCtx, expr: Expr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "lambda":
		return evalLambda(ctx, expr, env);
	case "callExpr":
		return evalCallExpr(ctx, expr, env);
	case "ref":
		return evalRef(ctx, expr, env);
	case "call":
		return evalCall(ctx, expr, env);
	case "let":
		return evalLet(ctx, expr, env);
	case "if":
		return evalIf(ctx, expr, env);
	case "var":
		return evalVar(expr, env);
	case "lit":
		return evalLitValue(expr);
	case "do":
		return evalDo(ctx, expr, env);
	default:
		return evalDataExpr(ctx, expr, env);
	}
}

function evalDataExpr(ctx: AirEvalCtx, expr: Expr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "record":
		return evalRecordExpr(ctx, expr, env);
	case "listOf":
		return evalListOfExpr(ctx, expr, env);
	case "match":
		return evalMatchExpr(ctx, expr, env);
	case "fix":
		return evalFixInline(ctx, expr, env);
	default:
		return errorVal(ErrorCodes.DomainError, "Unsupported expression kind in closure body: " + expr.kind);
	}
}

function evalRef(ctx: AirEvalCtx, expr: Expr & { kind: "ref" }, env: ValueEnv): Value {
	return ctx.nodeValues.get(expr.id) ?? lookupValue(env, expr.id)
		?? errorVal(ErrorCodes.DomainError, "Reference not found: " + expr.id);
}

function evalVar(expr: Expr & { kind: "var" }, env: ValueEnv): Value {
	const val = lookupValue(env, expr.name);
	return val ?? errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
}

/** Evaluate inline expression with nodeMap access. */
export function evalExprInline(ctx: Pick<AirEvalCtx, "registry" | "defs" | "nodeValues" | "options">, expr: Expr, env: ValueEnv): Value {
	const tempNodeMap = new Map<string, AirHybridNode>();
	tempNodeMap.set("__inline__", { id: "__inline__", expr });
	return evalExprWithNodeMap({ ...ctx, nodeMap: tempNodeMap }, expr, env);
}

//==============================================================================
// Simple handlers
//==============================================================================

function evalLambda(ctx: AirEvalCtx, expr: Expr & { kind: "lambda" }, env: ValueEnv): Value {
	const bodyNode = ctx.nodeMap.get(expr.body);
	if (!bodyNode) return errorVal(ErrorCodes.DomainError, "Lambda body node not found: " + expr.body);
	if (isBlockNode(bodyNode)) return errorVal(ErrorCodes.DomainError, "Block nodes as lambda bodies are not supported");
	const params: LambdaParam[] = expr.params.map(p => typeof p === "string" ? { name: p } : p);
	return closureVal(params, bodyNode.expr, env);
}

function evalDo(ctx: AirEvalCtx, expr: Expr & { kind: "do" }, env: ValueEnv): Value {
	if (expr.exprs.length === 0) return voidVal();
	let result: Value = voidVal();
	for (const e of expr.exprs) {
		result = typeof e === "string" ? resolveDoRef(ctx, e, env) : evalExprWithNodeMap(ctx, e, env);
		if (isError(result)) return result;
	}
	return result;
}

function resolveDoRef(ctx: AirEvalCtx, e: string, env: ValueEnv): Value {
	const cached = ctx.nodeValues.get(e) ?? lookupValue(env, e);
	if (cached) return cached;
	const node = ctx.nodeMap.get(e);
	if (!node) return errorVal(ErrorCodes.DomainError, "Do expr ref not found: " + e);
	if (isBlockNode(node)) return evaluateBlockNode(node, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, env);
	return evalExprWithNodeMap(ctx, node.expr, env);
}

//==============================================================================
// callExpr handler
//==============================================================================

function evalCallExpr(ctx: AirEvalCtx, expr: Expr & { kind: "callExpr" }, env: ValueEnv): Value {
	const fnValue = resolveFnValue(ctx, expr.fn, env);
	if (!fnValue) return errorVal(ErrorCodes.DomainError, "Function not found: " + expr.fn);
	if (isError(fnValue)) return fnValue;
	if (fnValue.kind !== "closure") return errorVal(ErrorCodes.TypeError, "Expected closure, got: " + fnValue.kind);
	const argValues = resolveArgs(ctx, expr.args, env);
	if (!Array.isArray(argValues)) return argValues;
	return applyClosure(ctx, fnValue, argValues);
}

function resolveFnValue(ctx: AirEvalCtx, fn: string, env: ValueEnv): Value | undefined {
	let val = ctx.nodeValues.get(fn) ?? lookupValue(env, fn);
	if (!val) {
		const fnNode = ctx.nodeMap.get(fn);
		if (fnNode) val = resolveNodeValue(ctx, fnNode, env);
	}
	return val;
}

function resolveNodeValue(ctx: AirEvalCtx, node: AirHybridNode, env: ValueEnv): Value {
	if (isBlockNode(node)) return evaluateBlockNode(node, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, env);
	return evalExprWithNodeMap(ctx, node.expr, env);
}

function resolveSingleArg(ctx: AirEvalCtx, arg: string | Expr, env: ValueEnv): Value {
	if (typeof arg !== "string") return evalExprWithNodeMap(ctx, arg, env);
	const val = resolveOneArg(ctx, arg, env);
	if (!val) return errorVal(ErrorCodes.DomainError, "Argument not found: " + arg);
	return val;
}

function resolveArgs(ctx: AirEvalCtx, args: (string | Expr)[], env: ValueEnv): Value[] | Value {
	const values: Value[] = [];
	for (const arg of args) {
		const val = resolveSingleArg(ctx, arg, env);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

function resolveOneArg(ctx: AirEvalCtx, arg: string, env: ValueEnv): Value | undefined {
	let val = ctx.nodeValues.get(arg) ?? lookupValue(env, arg);
	if (!val) {
		const argNode = ctx.nodeMap.get(arg);
		if (argNode) val = resolveNodeValue(ctx, argNode, env);
	}
	return val;
}

function applyClosure(ctx: AirEvalCtx, fn: ClosureVal, args: Value[]): Value {
	const envResult = buildClosureEnv(ctx, fn, args);
	if ("kind" in envResult) return envResult;
	return evalExprWithNodeMap(ctx, fn.body, envResult);
}

//==============================================================================
// buildClosureEnv
//==============================================================================

interface ParamCtx {
	airCtx: AirEvalCtx;
	closureEnv: ValueEnv;
}

export function buildClosureEnv(ctx: AirEvalCtx, fn: ClosureVal, args: Value[]): ValueEnv | Value {
	const arityErr = checkClosureArity(fn, args);
	if (arityErr) return arityErr;
	return bindClosureParams({ airCtx: ctx, closureEnv: fn.env }, fn.params, args);
}

function checkClosureArity(fn: ClosureVal, args: Value[]): Value | undefined {
	const minArity = fn.params.filter(p => !p.optional).length;
	if (args.length < minArity) return errorVal(ErrorCodes.ArityError, `Arity error: expected at least ${minArity} args, got ${args.length}`);
	if (args.length > fn.params.length) return errorVal(ErrorCodes.ArityError, `Arity error: expected at most ${fn.params.length} args, got ${args.length}`);
	return undefined;
}

function bindClosureParams(pCtx: ParamCtx, params: LambdaParam[], args: Value[]): ValueEnv | Value {
	let callEnv = pCtx.closureEnv;
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		if (param === undefined) return errorVal(ErrorCodes.ValidationError, `Parameter at index ${i} is undefined`);
		const result = resolveParamValue(pCtx, param, args[i]);
		if (isError(result)) return result;
		callEnv = extendValueEnv(callEnv, param.name, result);
	}
	return callEnv;
}

function resolveParamValue(pCtx: ParamCtx, param: LambdaParam, argValue: Value | undefined): Value {
	if (argValue !== undefined) return argValue;
	if (param.optional) {
		if (param.default !== undefined) return evalExprWithNodeMap(pCtx.airCtx, param.default, pCtx.closureEnv);
		return undefinedVal();
	}
	return errorVal(ErrorCodes.ArityError, `Missing required parameter: ${param.name}`);
}

//==============================================================================
// call handler (operator + airDef)
//==============================================================================

interface CallCtx {
	airCtx: AirEvalCtx;
	expr: Expr & { kind: "call" };
	env: ValueEnv;
}

function evalCall(ctx: AirEvalCtx, expr: Expr & { kind: "call" }, env: ValueEnv): Value {
	// core:isError must receive error values without propagation
	if (expr.ns === "core" && expr.name === "isError") {
		const args = expr.args.map(arg => resolveCallArg(ctx, arg, env));
		return tryApplyOp({ airCtx: ctx, expr, env }, args);
	}
	const argValues = resolveCallArgs(ctx, expr, env);
	if (!Array.isArray(argValues)) return argValues;
	return tryApplyOp({ airCtx: ctx, expr, env }, argValues);
}

function resolveCallArgs(ctx: AirEvalCtx, expr: Expr & { kind: "call" }, env: ValueEnv): Value[] | Value {
	const values: Value[] = [];
	for (const arg of expr.args) {
		const val = resolveCallArg(ctx, arg, env);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

function resolveCallArg(ctx: AirEvalCtx, arg: string | Expr, env: ValueEnv): Value {
	if (typeof arg !== "string") return evalExprWithNodeMap(ctx, arg, env);
	const val = ctx.nodeValues.get(arg) ?? lookupValue(env, arg);
	if (val) return val;
	const argNode = ctx.nodeMap.get(arg);
	if (argNode) return resolveNodeValue(ctx, argNode, env);
	return errorVal(ErrorCodes.DomainError, "Argument not found: " + arg);
}

function tryApplyOp(cCtx: CallCtx, args: Value[]): Value {
	const op = lookupOperator(cCtx.airCtx.registry, cCtx.expr.ns, cCtx.expr.name);
	if (op) {
		if (op.params.length !== args.length) return errorVal(ErrorCodes.ArityError, "Arity error: " + cCtx.expr.ns + ":" + cCtx.expr.name);
		try { return op.fn(...args); } catch (e) {
			if (e instanceof SPIRALError) return e.toValue();
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}
	return tryApplyAirDef(cCtx, args);
}

function tryApplyAirDef(cCtx: CallCtx, args: Value[]): Value {
	const def = lookupDef(cCtx.airCtx.defs, cCtx.expr.ns, cCtx.expr.name);
	if (!def) return errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + cCtx.expr.ns + ":" + cCtx.expr.name);
	if (def.params.length !== args.length) return errorVal(ErrorCodes.ArityError, "Arity error: " + cCtx.expr.ns + ":" + cCtx.expr.name);
	let defEnv: ValueEnv = cCtx.env;
	for (let i = 0; i < def.params.length; i++) {
		const p = def.params[i];
		const a = args[i];
		if (p !== undefined && a !== undefined) defEnv = extendValueEnv(defEnv, p, a);
	}
	return evalExprWithNodeMap(cCtx.airCtx, def.body, defEnv);
}

//==============================================================================
// let / if handlers
//==============================================================================

function evalLet(ctx: AirEvalCtx, expr: Expr & { kind: "let" }, env: ValueEnv): Value {
	const val = resolveStringOrExprInCtx(ctx, expr.value, env);
	if (isError(val)) return val;
	const letEnv = extendValueEnv(env, expr.name, val);
	return resolveStringOrExprInCtx(ctx, expr.body, letEnv);
}

function evalIf(ctx: AirEvalCtx, expr: Expr & { kind: "if" }, env: ValueEnv): Value {
	const condValue = resolveStringOrExprInCtx(ctx, expr.cond, env);
	if (isError(condValue)) return condValue;
	if (condValue.kind !== "bool") return errorVal(ErrorCodes.TypeError, "Condition must be boolean, got: " + condValue.kind);
	const branch = condValue.value ? expr.then : expr.else;
	return resolveStringOrExprInCtx(ctx, branch, env);
}

//==============================================================================
// record / listOf / match handlers
//==============================================================================

function resolveStringOrExprInCtx(ctx: AirEvalCtx, ref: string | Expr, env: ValueEnv): Value {
	if (typeof ref !== "string") return evalExprWithNodeMap(ctx, ref, env);
	const cached = ctx.nodeValues.get(ref) ?? lookupValue(env, ref);
	if (cached) return cached;
	const node = ctx.nodeMap.get(ref);
	if (!node) return errorVal(ErrorCodes.DomainError, "Reference not found: " + ref);
	return resolveNodeValue(ctx, node, env);
}

function evalRecordExpr(ctx: AirEvalCtx, expr: Expr & { kind: "record" }, env: ValueEnv): Value {
	const entries = new Map<string, Value>();
	for (const field of expr.fields) {
		const val = resolveStringOrExprInCtx(ctx, field.value, env);
		if (isError(val)) return val;
		entries.set("s:" + field.key, val);
	}
	return mapVal(entries);
}

function evalListOfExpr(ctx: AirEvalCtx, expr: Expr & { kind: "listOf" }, env: ValueEnv): Value {
	const elements: Value[] = [];
	for (const elem of expr.elements) {
		const val = resolveStringOrExprInCtx(ctx, elem, env);
		if (isError(val)) return val;
		elements.push(val);
	}
	return listVal(elements);
}

function evalMatchExpr(ctx: AirEvalCtx, expr: Expr & { kind: "match" }, env: ValueEnv): Value {
	const matchVal = resolveStringOrExprInCtx(ctx, expr.value, env);
	if (isError(matchVal)) return matchVal;
	if (matchVal.kind !== "string") return errorVal(ErrorCodes.TypeError, "Match value must be a string, got: " + matchVal.kind);
	for (const c of expr.cases) {
		if (matchVal.value === c.pattern) {
			return resolveStringOrExprInCtx(ctx, c.body, env);
		}
	}
	if (expr.default !== undefined) {
		return resolveStringOrExprInCtx(ctx, expr.default, env);
	}
	return errorVal(ErrorCodes.DomainError, "No matching case for: " + matchVal.value);
}

function mergeEnvs(base: ValueEnv, overlay: ValueEnv): ValueEnv {
	const merged = new Map(base);
	for (const [k, v] of overlay) merged.set(k, v);
	return merged;
}

function evalFixInline(ctx: AirEvalCtx, expr: Expr & { kind: "fix" }, env: ValueEnv): Value {
	const fnValue = resolveStringOrExprInCtx(ctx, expr.fn, env);
	if (isError(fnValue)) return fnValue;
	if (fnValue.kind !== "closure") return errorVal(ErrorCodes.TypeError, "Expected closure, got: " + fnValue.kind);
	if (fnValue.params.length !== 1) return errorVal(ErrorCodes.ArityError, "Fix requires single-parameter function");
	const param = fnValue.params[0];
	if (!param) return errorVal(ErrorCodes.ArityError, "fix requires a function with at least one parameter");
	const mergedEnv = mergeEnvs(fnValue.env, env);
	const selfRef: ClosureVal = { kind: "closure", params: [], body: fnValue.body, env: mergedEnv };
	const fixEnv = extendValueEnv(mergedEnv, param.name, selfRef);
	const inner = evalExprWithNodeMap(ctx, fnValue.body, fixEnv);
	if (isError(inner)) return inner;
	if (inner.kind !== "closure") return errorVal(ErrorCodes.TypeError, "Fix body should evaluate to closure, got: " + inner.kind);
	selfRef.params = inner.params;
	selfRef.body = inner.body;
	selfRef.env = extendValueEnv(mergeEnvs(inner.env, env), param.name, selfRef);
	return selfRef;
}
