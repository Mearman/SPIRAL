// AIR/CIR per-kind type checkers extracted from typeCheckNode

import { SPIRALError } from "../errors.ts";
import { extendTypeEnv } from "../env.ts";
import { navigate } from "../utils/json-pointer.ts";
import type { EirExpr, EirHybridNode, Expr, LambdaParam, Type } from "../types.ts";
import { isBlockNode, isExprNode, isRefNode } from "../types.ts";
import {
	boolType,
	intType,
	typeEqual,
	voidType,
} from "../types.ts";
import type { AIRCheckContext, TypeCheckResult } from "./context.ts";
import {
	checkIfCondition,
	resolveIfBranch,
	validateBranchType,
	checkCallExprParamOrBound,
	checkCallExprWithFnType,
	validateFixFnType,
	validateFixArity,
} from "./air-helpers.ts";

/**
 * Type check a single AIR/CIR node, resolving references.
 */
export function typeCheckNode(
	ctx: AIRCheckContext,
	node: EirHybridNode,
): TypeCheckResult {
	if (isBlockNode(node)) {
		return { type: node.type ?? intType, env: ctx.env };
	}
	if (isRefNode(node)) {
		// RefNode (node-level $ref) - resolve and type-check the referenced target
		const docRoot = ctx.docDefs ?? { nodes: [] };
		const result = navigate(docRoot, node.$ref);
		if (!result.success) {
			throw SPIRALError.validation("$ref", "JSON Pointer resolution failed: " + result.error);
		}
		const refValue = result.value;
		// If the reference points to a node, type-check it
		if (isRefNodeWithValue(refValue)) {
			return typeCheckNode(ctx, refValue as EirHybridNode);
		}
		// If the reference points to an expression, type-check it
		if (isRefExprValue(refValue)) {
			return ctx.checker.typeCheck(refValue, ctx.env);
		}
		// Default to int type
		return { type: intType, env: ctx.env };
	}
	if (!isExprNode(node)) {
		return { type: intType, env: ctx.env };
	}
	return checkExprKind(ctx, node.expr);
}

function checkExprKind(ctx: AIRCheckContext, expr: EirExpr): TypeCheckResult {
	switch (expr.kind) {
	case "lit":
	case "var":
		return ctx.checker.typeCheck(expr, ctx.env);
	case "ref":
		return checkRef(ctx, expr);
	case "$ref":
		return checkJsonPointerRef(ctx, expr);
	case "call":
		return ctx.checker.typeCheck(expr, ctx.env);
	case "if":
		return checkIf(ctx, expr);
	case "let":
		return checkLet(ctx, expr);
	case "airRef":
		return checkAirRef(ctx, expr);
	case "predicate":
		return checkPredicate(ctx, expr);
	default:
		return checkCirOrAsync(ctx, expr);
	}
}

function checkCirOrAsync(ctx: AIRCheckContext, expr: EirExpr): TypeCheckResult {
	switch (expr.kind) {
	case "lambda":
		return checkLambda(ctx, expr);
	case "callExpr":
		return checkCallExpr(ctx, expr);
	case "fix":
		return checkFix(ctx, expr);
	case "do":
		return checkDo(ctx, expr);
	default:
		return checkAsyncOrExhaustive(ctx, expr);
	}
}

function checkAsyncOrExhaustive(ctx: AIRCheckContext, expr: { kind: string }): TypeCheckResult {
	switch (expr.kind) {
	case "par":
	case "spawn":
	case "await":
	case "channel":
	case "send":
	case "recv":
	case "select":
	case "race":
		return { type: voidType, env: ctx.env };
	default:
		throw new Error("Unhandled expression kind: " + expr.kind);
	}
}

function checkRef(
	ctx: AIRCheckContext,
	expr: { kind: "ref"; id: string },
): TypeCheckResult {
	const targetType = ctx.nodeTypes.get(expr.id);
	if (!targetType) {
		throw SPIRALError.validation("ref", "Referenced node not found: " + expr.id);
	}
	return { type: targetType, env: ctx.env };
}

function checkJsonPointerRef(
	ctx: AIRCheckContext,
	expr: { kind: "$ref"; $ref: string },
): TypeCheckResult {
	const docRoot = ctx.docDefs ?? { nodes: [] };
	const result = navigate(docRoot, expr.$ref);
	if (!result.success) {
		throw SPIRALError.validation("$ref", "JSON Pointer resolution failed: " + result.error);
	}
	const refValue = result.value;

	// Check if the reference points to a literal expression
	if (isRefLitValue(refValue)) {
		return { type: refValue.type, env: ctx.env };
	}
	// Check if the reference points to another expression
	if (isRefExprValue(refValue)) {
		return ctx.checker.typeCheck(refValue, ctx.env);
	}
	// Check if the reference points to a node with an expression
	if (isRefNodeWithValue(refValue)) {
		return ctx.checker.typeCheck(refValue.expr, ctx.env);
	}
	// Default to int type for other cases
	return { type: intType, env: ctx.env };
}

function isRefLitValue(value: unknown): value is { type: Type; kind: string } {
	return typeof value === "object" && value !== null && "type" in value && "kind" in value && (value as { kind: string }).kind === "lit";
}

function isRefExprValue(value: unknown): value is Expr {
	return typeof value === "object" && value !== null && "kind" in value;
}

function isRefNodeWithValue(value: unknown): value is { expr: Expr } {
	return typeof value === "object" && value !== null && "expr" in value && "id" in value;
}

function checkIf(
	ctx: AIRCheckContext,
	expr: { kind: "if"; cond: string | Expr; then: string | Expr; else: string | Expr; type?: Type | undefined },
): TypeCheckResult {
	checkIfCondition(ctx, expr.cond);
	const dt: Type = expr.type ?? { kind: "int" };
	const thenType = resolveIfBranch({ ctx, branchVal: expr.then, branchName: "Then", declaredType: dt });
	const elseType = resolveIfBranch({ ctx, branchVal: expr.else, branchName: "Else", declaredType: dt });
	validateBranchType({ ctx, branchVal: expr.then, branchType: thenType, declaredType: dt, label: "if then branch" });
	validateBranchType({ ctx, branchVal: expr.else, branchType: elseType, declaredType: dt, label: "if else branch" });
	return { type: dt, env: ctx.env };
}

/** Resolve a node ref that could be a node, lambda param, or bound node. */
function resolveFlexibleRef(
	ctx: AIRCheckContext,
	ref: string,
	label: string,
): Type {
	if (!ctx.nodeMap.has(ref) && !ctx.lambdaParams.has(ref)) {
		throw SPIRALError.validation("let", label + " not found: " + ref);
	}
	const nodeType = ctx.nodeTypes.get(ref);
	if (nodeType) return nodeType;
	if (ctx.boundNodes.has(ref) || ctx.lambdaParams.has(ref)) {
		return intType;
	}
	throw SPIRALError.validation("let", label + " not yet type-checked: " + ref);
}

function resolveLetValue(ctx: AIRCheckContext, letValue: string | Expr): Type {
	if (typeof letValue === "string") {
		return resolveFlexibleRef(ctx, letValue, "Value node");
	}
	return ctx.checker.typeCheck(letValue, ctx.env).type;
}

function resolveLetBody(
	ctx: AIRCheckContext,
	letBody: string | Expr,
	extendedEnv: import("../env.js").TypeEnv,
): Type {
	if (typeof letBody === "string") {
		return resolveFlexibleRef(ctx, letBody, "Body node");
	}
	return ctx.checker.typeCheck(letBody, extendedEnv).type;
}

function checkLet(
	ctx: AIRCheckContext,
	expr: { kind: "let"; name: string; value: string | Expr; body: string | Expr },
): TypeCheckResult {
	const valueType = resolveLetValue(ctx, expr.value);
	const extendedEnv = extendTypeEnv(ctx.env, expr.name, valueType);
	const bodyType = resolveLetBody(ctx, expr.body, extendedEnv);
	return { type: bodyType, env: extendedEnv };
}

function checkAirRef(
	ctx: AIRCheckContext,
	expr: { kind: "airRef"; ns: string; name: string; args: string[] },
): TypeCheckResult {
	for (const argId of expr.args) {
		validateAirRefArg(ctx, argId);
	}
	return ctx.checker.typeCheck(expr, ctx.env);
}

function validateAirRefArg(ctx: AIRCheckContext, argId: string): void {
	if (!ctx.nodeMap.get(argId)) {
		throw SPIRALError.validation("airRef", "Argument node not found: " + argId);
	}
	if (!ctx.nodeTypes.has(argId)) {
		throw SPIRALError.validation("airRef", "Argument node not yet type-checked: " + argId);
	}
}

function checkPredicate(
	ctx: AIRCheckContext,
	expr: { kind: "predicate"; name: string; value: string },
): TypeCheckResult {
	if (!ctx.nodeMap.has(expr.value)) {
		throw SPIRALError.validation("predicate", "Value node not found: " + expr.value);
	}
	return { type: boolType, env: ctx.env };
}

function checkLambda(
	ctx: AIRCheckContext,
	expr: { kind: "lambda"; params: (string | LambdaParam)[]; body: string; type: Type },
): TypeCheckResult {
	if (!ctx.nodeMap.has(expr.body)) {
		throw SPIRALError.validation("lambda", "Body node not found: " + expr.body);
	}
	validateLambdaType(expr);
	validateLambdaBody(ctx, expr);
	return { type: expr.type, env: ctx.env };
}

function validateLambdaType(expr: { type: Type }): void {
	if (expr.type.kind !== "fn") {
		throw SPIRALError.typeError(
			{ kind: "fn", params: [], returns: intType },
			expr.type,
			"lambda",
		);
	}
}

function validateLambdaBody(
	ctx: AIRCheckContext,
	expr: { body: string; type: Type },
): void {
	if (expr.type.kind !== "fn") return;
	const bodyType = ctx.nodeTypes.get(expr.body);
	if (bodyType && !typeEqual(bodyType, expr.type.returns)) {
		throw SPIRALError.typeError(expr.type.returns, bodyType, "lambda body");
	}
}

function checkCallExprArgs(ctx: AIRCheckContext, args: (string | Expr)[]): void {
	for (const arg of args) {
		if (typeof arg !== "string") continue;
		if (!ctx.nodeMap.has(arg) && !ctx.lambdaParams.has(arg)) {
			throw SPIRALError.validation("callExpr", "Argument node not found: " + arg);
		}
	}
}

function checkCallExpr(
	ctx: AIRCheckContext,
	expr: { kind: "callExpr"; fn: string; args: (string | Expr)[] },
): TypeCheckResult {
	checkCallExprArgs(ctx, expr.args);
	if (!ctx.nodeMap.has(expr.fn) && !ctx.lambdaParams.has(expr.fn)) {
		throw SPIRALError.validation("callExpr", "Function node not found: " + expr.fn);
	}
	if (ctx.lambdaParams.has(expr.fn) || ctx.boundNodes.has(expr.fn)) {
		return checkCallExprParamOrBound(ctx, expr.fn);
	}
	return checkCallExprWithFnType(ctx, expr);
}

function checkFix(
	ctx: AIRCheckContext,
	expr: { kind: "fix"; fn: string; type: Type },
): TypeCheckResult {
	if (!ctx.nodeMap.has(expr.fn)) {
		throw SPIRALError.validation("fix", "Function node not found: " + expr.fn);
	}
	const fnType = ctx.nodeTypes.get(expr.fn);
	if (!fnType) {
		throw SPIRALError.validation("fix", "Function node not yet type-checked: " + expr.fn);
	}
	validateFixFnType(fnType);
	validateFixArity(fnType, expr.type);
	return { type: expr.type, env: ctx.env };
}

function checkDo(
	ctx: AIRCheckContext,
	expr: { kind: "do"; exprs: (string | Expr)[] },
): TypeCheckResult {
	if (expr.exprs.length === 0) {
		return { type: voidType, env: ctx.env };
	}
	let lastType: Type = voidType;
	for (const e of expr.exprs) {
		lastType = resolveDoElement(ctx, e);
	}
	return { type: lastType, env: ctx.env };
}

function resolveDoElement(ctx: AIRCheckContext, e: string | Expr): Type {
	if (typeof e === "string") {
		return ctx.nodeTypes.get(e) ?? voidType;
	}
	return ctx.checker.typeCheck(e, ctx.env).type;
}
