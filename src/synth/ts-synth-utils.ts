// Expression analysis utilities for TypeScript synthesis

import type { Expr, EirExpr, Node, EirNode } from "../types.js";
import type { ExprSynthState } from "./ts-synth-shared.js";

//==============================================================================
// exprHasFreeVars - check for inline var references
//==============================================================================

function hasFreeVarsInArgs(args: (string | Expr | EirExpr)[]): boolean {
	return args.some(a => typeof a !== "string" && exprHasFreeVars(a));
}

function hasFreeVarsInPair(
	a: string | Expr | EirExpr,
	b: string | Expr | EirExpr,
): boolean {
	return (typeof a !== "string" && exprHasFreeVars(a)) ||
		(typeof b !== "string" && exprHasFreeVars(b));
}

function exprHasFreeVarsBasic(expr: Expr | EirExpr): boolean | undefined {
	if (expr.kind === "var") return true;
	if (expr.kind === "call") return hasFreeVarsInArgs(expr.args);
	if (expr.kind === "do") return hasFreeVarsInArgs(expr.exprs);
	if (expr.kind === "seq") return hasFreeVarsInPair(expr.first, expr.then);
	if (expr.kind === "effect") return hasFreeVarsInArgs(expr.args);
	if (expr.kind === "assign") return typeof expr.value !== "string" && exprHasFreeVars(expr.value);
	return undefined;
}

function exprHasFreeVarsEir(expr: Expr | EirExpr): boolean | undefined {
	if (expr.kind === "while") return hasFreeVarsInPair(expr.cond, expr.body);
	if (expr.kind === "iter") return hasFreeVarsInPair(expr.iter, expr.body);
	if (expr.kind === "callExpr") {
		return (typeof expr.fn !== "string" && exprHasFreeVars(expr.fn)) ||
			hasFreeVarsInArgs(expr.args);
	}
	if (expr.kind === "for") {
		return hasFreeVarsInPair(expr.init, expr.cond) ||
			hasFreeVarsInPair(expr.update, expr.body);
	}
	if (expr.kind === "try") return hasFreeVarsInPair(expr.tryBody, expr.catchBody);
	return undefined;
}

export function exprHasFreeVars(expr: Expr | EirExpr): boolean {
	return exprHasFreeVarsBasic(expr) ?? exprHasFreeVarsEir(expr) ?? false;
}

//==============================================================================
// exprHasParamRefs - check for parameter name references
//==============================================================================

function makeParamRefChecker(
	paramNames: Set<string>,
	nodeMap: Map<string, Node | EirNode>,
): (ref: string | Expr | EirExpr) => boolean {
	return (ref) => typeof ref === "string" && paramNames.has(ref) && !nodeMap.has(ref);
}

export function exprHasParamRefs(
	expr: Expr | EirExpr,
	paramNames: Set<string>,
	nodeMap: Map<string, Node | EirNode>,
): boolean {
	const isParamRef = makeParamRefChecker(paramNames, nodeMap);

	switch (expr.kind) {
	case "callExpr": return isParamRef(expr.fn) || expr.args.some(isParamRef);
	case "call": return expr.args.some(isParamRef);
	case "ref": return isParamRef(expr.id);
	case "if": return [expr.cond, expr.then, expr.else].some(isParamRef);
	case "do": return expr.exprs.some(isParamRef);
	case "seq": return [expr.first, expr.then].some(isParamRef);
	default: return false;
	}
}

//==============================================================================
// Transitive inlining
//==============================================================================

function getExprRefs(expr: Expr | EirExpr): (string | Expr | EirExpr)[] {
	if (expr.kind === "call") return expr.args;
	if (expr.kind === "callExpr") return [expr.fn, ...expr.args];
	if (expr.kind === "if") return [expr.cond, expr.then, expr.else];
	if (expr.kind === "do") return expr.exprs;
	if (expr.kind === "seq") return [expr.first, expr.then];
	return [];
}

export function collectTransitiveInlines(
	state: ExprSynthState,
	expr: Expr | EirExpr,
	paramNames: Set<string>,
): void {
	const checkRef = (ref: string | Expr | EirExpr): void => {
		if (typeof ref !== "string") return;
		const node = state.nodeMap.get(ref);
		if (!node || state.inlinedNodes.has(ref)) return;
		if (exprHasFreeVars(node.expr) || exprHasParamRefs(node.expr, paramNames, state.nodeMap)) {
			state.inlinedNodes.add(ref);
			collectTransitiveInlines(state, node.expr, paramNames);
		}
	};

	getExprRefs(expr).forEach(checkRef);
}

export function markInlinedBodies(
	state: ExprSynthState,
	bodyId: string,
	paramNames: Set<string>,
): void {
	const bodyNode = state.nodeMap.get(bodyId);
	if (!bodyNode) return;
	if (exprHasFreeVars(bodyNode.expr) || exprHasParamRefs(bodyNode.expr, paramNames, state.nodeMap)) {
		state.inlinedNodes.add(bodyId);
		collectTransitiveInlines(state, bodyNode.expr, paramNames);
	}
}
