// AIR/CIR per-kind type checkers extracted from typeCheckNode

import { SPIRALError } from "../errors.js";
import { extendTypeEnv } from "../env.js";
import type { EirExpr, EirHybridNode, Expr, Type } from "../types.js";
import { isBlockNode } from "../types.js";
import {
	boolType,
	intType,
	typeEqual,
	voidType,
} from "../types.js";
import type { AIRCheckContext, TypeCheckResult } from "./context.js";
import {
	checkIfCondition,
	resolveIfBranch,
	validateBranchType,
	checkCallExprParamOrBound,
	checkCallExprWithFnType,
	validateFixFnType,
	validateFixArity,
} from "./air-helpers.js";

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
	return checkExprKind(ctx, node.expr);
}

function checkExprKind(ctx: AIRCheckContext, expr: EirExpr): TypeCheckResult {
	switch (expr.kind) {
	case "lit":
	case "var":
		return ctx.checker.typeCheck(expr, ctx.env);
	case "ref":
		return checkRef(ctx, expr);
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
	expr: { kind: "lambda"; params: string[]; body: string; type: Type },
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

function checkCallExprArgs(ctx: AIRCheckContext, args: string[]): void {
	for (const argId of args) {
		if (!ctx.nodeMap.has(argId) && !ctx.lambdaParams.has(argId)) {
			throw SPIRALError.validation("callExpr", "Argument node not found: " + argId);
		}
	}
}

function checkCallExpr(
	ctx: AIRCheckContext,
	expr: { kind: "callExpr"; fn: string; args: string[] },
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
