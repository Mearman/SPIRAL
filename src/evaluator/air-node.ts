// evalNode - dispatch per expression kind for AIR/CIR nodes

import { navigate } from "../utils/json-pointer.ts";
import {
	type ValueEnv,
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.ts";
import { SPIRALError, ErrorCodes } from "../errors.ts";
import {
	type AirHybridNode,
	type Expr,
	type LambdaParam,
	type Type,
	type Value,
	isBlockNode,
	isExprNode,
	isRefNode,
	voidVal,
	closureVal,
	boolVal,
	errorVal,
	isError,
	listVal,
	mapVal,
} from "../types.ts";
import type { EvalContext, NodeEvalResult } from "./types.ts";
import type { ProgramCtx } from "./air-program.ts";
import { applyOperator, type OpCall } from "./helpers.ts";
import { evaluateBlockNode } from "./block-eval.ts";
import { evalExprWithNodeMap } from "./air-expr.ts";
import { evalLitValue } from "./lit-eval.ts";
import {
	evalNodeCallExpr,
	evalNodeFix,
} from "./air-node-fn.ts";

//==============================================================================
// evalNode - main entry
//==============================================================================

/** Evaluate a single AIR/CIR node. */
export function evalNode(
	ctx: ProgramCtx,
	node: AirHybridNode,
	env: ValueEnv,
): NodeEvalResult {
	// Handle node-level $ref (RefNode) for aliasing
	if ("$ref" in node) {
		return evalNodeJsonPointerRef(ctx, node as { id: string; $ref: string }, env);
	}
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
	case "$ref":
		return evalNodeJsonPointerRef(ctx, { id: "", $ref: expr.$ref }, env);
	case "call":
		return evalNodeCall(ctx, expr, env);
	case "if":
		return evalNodeIf(ctx, expr, env);
	case "let":
		return evalNodeLet(ctx, expr, env);
	case "do":
		return evalNodeDo(ctx, expr, env);
	case "record":
		return evalNodeRecord(ctx, expr, env);
	case "listOf":
		return evalNodeListOf(ctx, expr, env);
	case "match":
		return evalNodeMatch(ctx, expr, env);
	default:
		return undefined;
	}
}

function dispatchComplexExpr(ctx: ProgramCtx, expr: Expr, env: ValueEnv): NodeEvalResult {
	switch (expr.kind) {
	case "predicate":
		return evalNodePredicate(ctx, expr);
	case "lambda":
		return evalNodeLambda(ctx, expr, env);
	case "callExpr":
		ensureNodeEvaluated(ctx, expr.fn, env);
		for (const arg of expr.args) {
			if (typeof arg === "string") ensureNodeEvaluated(ctx, arg, env);
		}
		return evalNodeCallExpr(ctx, expr, env);
	case "fix":
		ensureNodeEvaluated(ctx, expr.fn, env);
		return evalNodeFix(ctx, expr, env);
	default:
		return evalNodeRemainder(expr, env);
	}
}

/** Lazily evaluate a bound node on demand (nodeMap fallback for callExpr/fix fn). */
function ensureNodeEvaluated(ctx: ProgramCtx, id: string, env: ValueEnv): void {
	if (ctx.nodeValues.has(id)) return;
	if (lookupValue(env, id)) return;
	const node = ctx.nodeMap.get(id);
	if (!node) return;
	const r = evalNode(ctx, node, env);
	ctx.nodeValues.set(id, r.value);
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

function evalNodeJsonPointerRef(ctx: ProgramCtx, node: { id: string; $ref: string }, env: ValueEnv): NodeEvalResult {
	// Use the document itself as the root for JSON Pointer navigation
	const docRoot = ctx.docDefs ?? { nodes: [] };
	const result = navigate(docRoot, node.$ref);
	if (!result.success) {
		return { value: errorVal(ErrorCodes.DomainError, "JSON Pointer resolution failed: " + result.error), env };
	}
	const refValue = result.value;

	// If the reference points to another node, evaluate it
	if (isNodeValue(refValue)) {
		return evalNode(ctx, refValue, env);
	}

	// If the reference points to an expression, evaluate it
	if (isExprValue(refValue)) {
		return { value: evalExprWithNodeMap(ctx, refValue, env), env };
	}

	// If the reference points to a literal value, convert it to a Value
	if (isLitValue(refValue)) {
		// refValue has structure { kind: "lit", type: Type, value: unknown }
		// evalLitValue expects { type: Type, value: unknown }
		return { value: evalLitValue({ type: refValue.type, value: refValue.value }), env };
	}

	return { value: errorVal(ErrorCodes.DomainError, "JSON Pointer reference did not resolve to a valid value"), env };
}

/** Check if a value is a node (has id and expr or blocks) */
function isNodeValue(value: unknown): value is AirHybridNode {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return "id" in v && typeof v.id === "string" && ("expr" in v || "blocks" in v || "$ref" in v);
}

/** Check if a value is an expression (has kind) */
function isExprValue(value: unknown): value is Expr {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	const kind = v.kind;
	return "kind" in v && typeof kind === "string";
}

/** Check if a value is a literal expression (LitExpr) */
function isLitValue(value: unknown): value is { kind: "lit"; type: Type; value: unknown } {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	const kind = v.kind;
	return typeof kind === "string" && kind === "lit" && "type" in v && "value" in v;
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
	if (isBlockNode(bodyNode) || isRefNode(bodyNode)) {
		return { value: errorVal(ErrorCodes.DomainError, "Block nodes as lambda bodies are not supported"), env };
	}
	if (!isExprNode(bodyNode)) {
		return { value: errorVal(ErrorCodes.DomainError, "Invalid body node type"), env };
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
	if (isRefNode(node)) {
		// RefNode - evaluate by resolving the reference
		return evalNode(ctx, node, env).value;
	}
	if (!isExprNode(node)) return errorVal(ErrorCodes.DomainError, "Invalid node type");
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
	if (isRefNode(bodyNode)) {
		// RefNode - evaluate by resolving the reference
		return evalNode(ctx, bodyNode, extEnv);
	}
	if (!isExprNode(bodyNode)) return { value: errorVal(ErrorCodes.DomainError, "Invalid body node type"), env: extEnv };
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
	if (isRefNode(node)) {
		// RefNode - evaluate by resolving the reference
		return evalNode(ctx, node, env).value;
	}
	if (!isExprNode(node)) return errorVal(ErrorCodes.DomainError, "Invalid node type");
	return evalExprWithNodeMap(ctx, node.expr, env);
}

//==============================================================================
// evalNodeRecord / evalNodeListOf / evalNodeMatch
//==============================================================================

function resolveStringOrExpr(ctx: ProgramCtx, ref: string | Expr, env: ValueEnv): Value {
	if (typeof ref !== "string") {
		return evalExprWithNodeMap(ctx, ref, env);
	}
	const cached = ctx.nodeValues.get(ref) ?? lookupValue(env, ref);
	if (cached) return cached;
	const node = ctx.nodeMap.get(ref);
	if (!node) return errorVal(ErrorCodes.DomainError, "Reference not found: " + ref);
	return evalNode(ctx, node, env).value;
}

function evalNodeRecord(ctx: ProgramCtx, expr: Expr & { kind: "record" }, env: ValueEnv): NodeEvalResult {
	const entries = new Map<string, Value>();
	for (const field of expr.fields) {
		const val = resolveStringOrExpr(ctx, field.value, env);
		if (isError(val)) return { value: val, env };
		entries.set("s:" + field.key, val);
	}
	return { value: mapVal(entries), env };
}

function evalNodeListOf(ctx: ProgramCtx, expr: Expr & { kind: "listOf" }, env: ValueEnv): NodeEvalResult {
	const elements: Value[] = [];
	for (const elem of expr.elements) {
		const val = resolveStringOrExpr(ctx, elem, env);
		if (isError(val)) return { value: val, env };
		elements.push(val);
	}
	return { value: listVal(elements), env };
}

function evalNodeMatch(ctx: ProgramCtx, expr: Expr & { kind: "match" }, env: ValueEnv): NodeEvalResult {
	const matchVal = resolveStringOrExpr(ctx, expr.value, env);
	if (isError(matchVal)) return { value: matchVal, env };
	if (matchVal.kind !== "string") return { value: errorVal(ErrorCodes.TypeError, "Match value must be a string, got: " + matchVal.kind), env };
	for (const c of expr.cases) {
		if (matchVal.value === c.pattern) {
			const body = resolveStringOrExpr(ctx, c.body, env);
			return { value: body, env };
		}
	}
	if (expr.default !== undefined) {
		const body = resolveStringOrExpr(ctx, expr.default, env);
		return { value: body, env };
	}
	return { value: errorVal(ErrorCodes.DomainError, "No matching case for: " + matchVal.value), env };
}
