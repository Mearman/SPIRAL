// evalNode - dispatch per expression kind for AIR/CIR nodes

import {
	type ValueEnv,
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.js";
import { SPIRALError, ErrorCodes } from "../errors.js";
import {
	type AirHybridNode,
	type Expr,
	type LambdaParam,
	type Value,
	isBlockNode,
	isExprNode,
	voidVal,
	closureVal,
	boolVal,
	errorVal,
	isError,
} from "../types.js";
import type { EvalContext, NodeEvalResult } from "./types.js";
import type { ProgramCtx } from "./air-program.js";
import { applyOperator, type OpCall } from "./helpers.js";
import { evaluateBlockNode } from "./block-eval.js";
import { evalExprWithNodeMap } from "./air-expr.js";
import {
	evalNodeCallExpr,
	evalNodeFix,
	evalNodeAirRef,
} from "./air-node-fn.js";

//==============================================================================
// evalNode - main entry
//==============================================================================

/** Evaluate a single AIR/CIR node. */
export function evalNode(
	ctx: ProgramCtx,
	node: AirHybridNode,
	env: ValueEnv,
): NodeEvalResult {
	if (isBlockNode(node)) {
		const blockCtx = { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options };
		return { value: evaluateBlockNode(node, blockCtx, env), env };
	}
	return evalNodeExpr(ctx, node.expr, env);
}

//==============================================================================
// evalNode dispatch
//==============================================================================

function evalNodeExpr(ctx: ProgramCtx, expr: Expr, env: ValueEnv): NodeEvalResult {
	const basic = dispatchBasicExpr(ctx, expr, env);
	if (basic) return basic;
	return dispatchComplexExpr(ctx, expr, env);
}

function dispatchBasicExpr(ctx: ProgramCtx, expr: Expr, env: ValueEnv): NodeEvalResult | undefined {
	switch (expr.kind) {
	case "lit":
	case "var":
		return evalNodeSimple(ctx, expr, env);
	case "ref":
		return evalNodeRef(ctx, expr, env);
	case "call":
		return evalNodeCall(ctx, expr, env);
	case "if":
		return evalNodeIf(ctx, expr, env);
	case "let":
		return evalNodeLet(ctx, expr, env);
	case "do":
		return evalNodeDo(ctx, expr, env);
	default:
		return undefined;
	}
}

function dispatchComplexExpr(ctx: ProgramCtx, expr: Expr, env: ValueEnv): NodeEvalResult {
	switch (expr.kind) {
	case "airRef":
		return evalNodeAirRef(ctx, expr, env);
	case "predicate":
		return evalNodePredicate(ctx, expr);
	case "lambda":
		return evalNodeLambda(ctx, expr, env);
	case "callExpr":
		return evalNodeCallExpr(ctx, expr, env);
	case "fix":
		return evalNodeFix(ctx, expr, env);
	default:
		return evalNodeRemainder(expr, env);
	}
}

export function makeState(ctx: ProgramCtx): EvalContext {
	return {
		steps: 0,
		maxSteps: ctx.options?.maxSteps ?? 10000,
		trace: ctx.options?.trace ?? false,
	};
}

function evalNodeSimple(ctx: ProgramCtx, expr: Expr, env: ValueEnv): NodeEvalResult {
	return { value: ctx.evaluator.evaluateWithState(expr, env, makeState(ctx)), env };
}

const ASYNC_KINDS = new Set(["par", "spawn", "await", "channel", "send", "recv", "select", "race"]);

function evalNodeRemainder(expr: Expr, env: ValueEnv): NodeEvalResult {
	if (ASYNC_KINDS.has(expr.kind)) {
		return { value: errorVal(ErrorCodes.DomainError, "Async expressions require AsyncEvaluator: " + expr.kind), env };
	}
	return { value: errorVal(ErrorCodes.DomainError, "Unsupported expression kind: " + expr.kind), env };
}

//==============================================================================
// Simple case handlers
//==============================================================================

function evalNodeRef(ctx: ProgramCtx, expr: Expr & { kind: "ref" }, env: ValueEnv): NodeEvalResult {
	let value = ctx.nodeValues.get(expr.id);
	if (!value) {
		const refNode = ctx.nodeMap.get(expr.id);
		if (refNode) {
			value = evalNode(ctx, refNode, env).value;
		} else {
			return { value: errorVal(ErrorCodes.DomainError, "Referenced node not found: " + expr.id), env };
		}
	}
	return { value, env };
}

function evalNodePredicate(ctx: ProgramCtx, expr: Expr & { kind: "predicate" }): NodeEvalResult {
	const v = ctx.nodeValues.get(expr.value);
	if (!v) {
		return { value: errorVal(ErrorCodes.DomainError, "Value node not evaluated: " + expr.value), env: emptyValueEnv() };
	}
	return { value: boolVal(true), env: emptyValueEnv() };
}

function evalNodeLambda(ctx: ProgramCtx, expr: Expr & { kind: "lambda" }, env: ValueEnv): NodeEvalResult {
	const bodyNode = ctx.nodeMap.get(expr.body);
	if (!bodyNode) return { value: errorVal(ErrorCodes.DomainError, "Body node not found: " + expr.body), env };
	if (isBlockNode(bodyNode)) {
		return { value: errorVal(ErrorCodes.DomainError, "Block nodes as lambda bodies are not supported"), env };
	}
	const params: LambdaParam[] = expr.params.map(p => typeof p === "string" ? { name: p } : p);
	return { value: closureVal(params, bodyNode.expr, env), env };
}

//==============================================================================
// evalNodeCall
//==============================================================================

export function evalNodeCall(ctx: ProgramCtx, expr: Expr & { kind: "call" }, env: ValueEnv): NodeEvalResult {
	const argResult = resolveNodeCallArgs(ctx, expr.args, env);
	if (isError(argResult.errVal)) return { value: argResult.errVal, env: argResult.env };
	return applyCallOp({ ctx, expr, env: argResult.env }, argResult.args);
}

interface ArgBuildResult { args: Value[]; env: ValueEnv; errVal: Value }

function resolveNodeCallArgs(
	ctx: ProgramCtx,
	args: (string | Expr)[],
	env: ValueEnv,
): ArgBuildResult {
	const values: Value[] = [];
	let currentEnv = env;
	for (const arg of args) {
		const result = resolveOneCallArg(ctx, arg, currentEnv);
		if (isError(result.value)) return { args: [], env: currentEnv, errVal: result.value };
		values.push(result.value);
		currentEnv = result.env;
	}
	return { args: values, env: currentEnv, errVal: voidVal() };
}

function resolveOneCallArg(ctx: ProgramCtx, arg: string | Expr, env: ValueEnv): NodeEvalResult {
	if (typeof arg !== "string") {
		const state = makeState(ctx);
		return { value: ctx.evaluator.evaluateWithState(arg, env, state), env };
	}
	return resolveStringCallArg(ctx, arg, env);
}

interface StringArgCtx {
	ctx: ProgramCtx;
	arg: string;
	env: ValueEnv;
}

function resolveStringCallArg(ctx: ProgramCtx, arg: string, env: ValueEnv): NodeEvalResult {
	const sa: StringArgCtx = { ctx, arg, env };
	const argNode = ctx.nodeMap.get(arg);
	const needsReeval = checkNeedsReeval(argNode);
	const cached = getCachedArgValue(ctx, arg, needsReeval);
	if (cached) return { value: cached, env };
	return resolveUncachedArg(sa, argNode);
}

function checkNeedsReeval(node: AirHybridNode | undefined): boolean {
	if (!node || !isExprNode(node)) return false;
	return node.expr.kind === "var" || node.expr.kind === "let" || node.expr.kind === "call";
}

function getCachedArgValue(ctx: ProgramCtx, arg: string, needsReeval: boolean): Value | undefined {
	const cached = ctx.nodeValues.get(arg);
	if (cached && !isError(cached) && !needsReeval) return cached;
	return undefined;
}

function resolveUncachedArg(sa: StringArgCtx, argNode: AirHybridNode | undefined): NodeEvalResult {
	if (argNode) {
		const r = evalNode(sa.ctx, argNode, sa.env);
		if (isExprNode(argNode) && argNode.expr.kind === "let" && !isError(r.value)) {
			sa.ctx.nodeValues.set(sa.arg, r.value);
		}
		return { value: r.value, env: r.env };
	}
	const fromEnv = lookupValue(sa.env, sa.arg);
	if (fromEnv) return { value: fromEnv, env: sa.env };
	return { value: errorVal(ErrorCodes.DomainError, "Argument not found: " + sa.arg), env: sa.env };
}

interface NodeCallCtx {
	ctx: ProgramCtx;
	expr: Expr & { kind: "call" };
	env: ValueEnv;
}

function applyCallOp(nc: NodeCallCtx, args: Value[]): NodeEvalResult {
	const op: OpCall = { registry: nc.ctx.registry, ns: nc.expr.ns, name: nc.expr.name };
	try {
		return { value: applyOperator(op, args), env: nc.env };
	} catch (e) {
		if (e instanceof SPIRALError) return { value: e.toValue(), env: nc.env };
		return { value: errorVal(ErrorCodes.DomainError, String(e)), env: nc.env };
	}
}

//==============================================================================
// evalNodeIf
//==============================================================================

function evalNodeIf(ctx: ProgramCtx, expr: Expr & { kind: "if" }, env: ValueEnv): NodeEvalResult {
	if (typeof expr.cond !== "string" || typeof expr.then !== "string" || typeof expr.else !== "string") {
		return { value: errorVal(ErrorCodes.DomainError, "Inline expressions not supported"), env };
	}
	const condValue = resolveCondition(ctx, expr.cond, env);
	if (!condValue) return { value: errorVal(ErrorCodes.DomainError, "Condition node not evaluated: " + expr.cond), env };
	if (isError(condValue)) return { value: condValue, env };
	const branchId = condValue.kind === "bool" && condValue.value ? expr.then : expr.else;
	return resolveBranch(ctx, branchId, env);
}

function resolveCondition(ctx: ProgramCtx, cond: string, env: ValueEnv): Value | undefined {
	const cached = ctx.nodeValues.get(cond) ?? lookupValue(env, cond);
	if (cached) return cached;
	const condNode = ctx.nodeMap.get(cond);
	if (condNode) return evalNode(ctx, condNode, env).value;
	return undefined;
}

function resolveBranch(ctx: ProgramCtx, branchId: string, env: ValueEnv): NodeEvalResult {
	const cached = ctx.nodeValues.get(branchId) ?? lookupValue(env, branchId);
	if (cached) return { value: cached, env };
	const branchNode = ctx.nodeMap.get(branchId);
	if (!branchNode) return { value: errorVal(ErrorCodes.DomainError, "Branch node not found: " + branchId), env };
	return { value: evalNode(ctx, branchNode, env).value, env };
}

//==============================================================================
// evalNodeLet
//==============================================================================

function evalNodeLet(ctx: ProgramCtx, expr: Expr & { kind: "let" }, env: ValueEnv): NodeEvalResult {
	const val = resolveLetValue(ctx, expr, env);
	if (isError(val)) return { value: val, env };
	const extEnv = extendValueEnv(env, expr.name, val);
	return resolveLetBody(ctx, expr, extEnv);
}

function resolveLetValue(ctx: ProgramCtx, expr: Expr & { kind: "let" }, env: ValueEnv): Value {
	if (typeof expr.value !== "string") {
		return ctx.evaluator.evaluateWithState(expr.value, env, makeState(ctx));
	}
	return resolveLetValueNode(ctx, expr.value, env);
}

function resolveLetValueNode(ctx: ProgramCtx, valueId: string, env: ValueEnv): Value {
	const val = ctx.nodeValues.get(valueId);
	if (val) return val;
	const node = ctx.nodeMap.get(valueId);
	if (!node) return errorVal(ErrorCodes.DomainError, "Value node not evaluated: " + valueId);
	if (isBlockNode(node)) return evaluateBlockNode(node, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, env);
	return evalExprWithNodeMap(ctx, node.expr, env);
}

function resolveLetBody(ctx: ProgramCtx, expr: Expr & { kind: "let" }, extEnv: ValueEnv): NodeEvalResult {
	if (typeof expr.body !== "string") {
		return { value: ctx.evaluator.evaluateWithState(expr.body, extEnv, makeState(ctx)), env: extEnv };
	}
	const bodyNode = ctx.nodeMap.get(expr.body);
	if (!bodyNode) return { value: errorVal(ErrorCodes.DomainError, "Body node not found: " + expr.body), env: extEnv };
	if (isBlockNode(bodyNode)) {
		return { value: evaluateBlockNode(bodyNode, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, extEnv), env: extEnv };
	}
	return resolveLetBodyExpr(ctx, bodyNode, extEnv);
}

function resolveLetBodyExpr(ctx: ProgramCtx, bodyNode: AirHybridNode & { expr: Expr }, extEnv: ValueEnv): NodeEvalResult {
	const expr = bodyNode.expr;
	if (expr.kind === "var") {
		const v = lookupValue(extEnv, expr.name);
		return v ? { value: v, env: extEnv } : { value: errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name), env: extEnv };
	}
	if (expr.kind === "lit") {
		return { value: ctx.evaluator.evaluateWithState(expr, extEnv, makeState(ctx)), env: extEnv };
	}
	if (expr.kind === "ref") {
		return resolveLetBodyRef(ctx, expr, extEnv);
	}
	const r = evalNode(ctx, bodyNode, extEnv);
	return { value: r.value, env: r.env };
}

function resolveLetBodyRef(ctx: ProgramCtx, expr: Expr & { kind: "ref" }, extEnv: ValueEnv): NodeEvalResult {
	const refValue = ctx.nodeValues.get(expr.id);
	if (refValue) return { value: refValue, env: extEnv };
	const refNode = ctx.nodeMap.get(expr.id);
	if (refNode) return { value: evalNode(ctx, refNode, extEnv).value, env: extEnv };
	return { value: errorVal(ErrorCodes.DomainError, "Referenced node not found: " + expr.id), env: extEnv };
}

//==============================================================================
// evalNodeDo
//==============================================================================

function evalNodeDo(ctx: ProgramCtx, expr: Expr & { kind: "do" }, env: ValueEnv): NodeEvalResult {
	if (expr.exprs.length === 0) return { value: voidVal(), env };
	let result: Value = voidVal();
	for (const e of expr.exprs) {
		result = typeof e === "string"
			? resolveDoRef(ctx, e, env)
			: evalExprWithNodeMap(ctx, e, env);
		if (isError(result)) return { value: result, env };
	}
	return { value: result, env };
}

function resolveDoRef(ctx: ProgramCtx, e: string, env: ValueEnv): Value {
	const cached = ctx.nodeValues.get(e) ?? lookupValue(env, e);
	if (cached) return cached;
	const node = ctx.nodeMap.get(e);
	if (!node) return errorVal(ErrorCodes.DomainError, "Do expr ref not found: " + e);
	if (isBlockNode(node)) return evaluateBlockNode(node, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, env);
	return evalExprWithNodeMap(ctx, node.expr, env);
}
