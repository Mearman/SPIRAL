// Bound node identification and lambda parameter collection

import type { AirHybridNode, Expr } from "../types.ts";
import { isBlockNode, isExprNode, isRefNode } from "../types.ts";

/**
 * Collect all lambda parameters and let binding names from a CIR program.
 */
export function collectLambdaParamsAndLetBindings(
	nodes: AirHybridNode[],
): Set<string> {
	const params = new Set<string>();

	for (const node of nodes) {
		if (isExprNode(node)) {
			addParamsFromExpr(params, node.expr);
		}
	}

	return params;
}

function addParamsFromExpr(params: Set<string>, expr: Expr): void {
	if (expr.kind === "lambda") {
		for (const p of expr.params) {
			params.add(typeof p === "string" ? p : p.name);
		}
	} else if (expr.kind === "let") {
		params.add(expr.name);
	}
}

/** Shared traversal state for bound node collection. */
interface BoundNodeState {
	boundNodes: Set<string>;
	nodeMap: Map<string, AirHybridNode>;
}

/**
 * Collect transitive dependencies of a lambda body node.
 */
function collectDeps(
	state: BoundNodeState,
	nodeId: string,
	visited: Set<string>,
): void {
	if (visited.has(nodeId)) return;
	visited.add(nodeId);
	state.boundNodes.add(nodeId);

	const node = state.nodeMap.get(nodeId);
	if (!node || isBlockNode(node) || isRefNode(node)) return;
	if (!isExprNode(node)) return;

	visitExprRefs(state, node.expr, visited);
}

function visitExprRefs(
	state: BoundNodeState,
	expr: Expr,
	visited: Set<string>,
): void {
	switch (expr.kind) {
	case "lambda":
		collectDeps(state, expr.body, visited);
		break;
	case "let":
		visitLetRefs(state, expr, visited);
		break;
	case "if":
		visitIfRefs(state, expr, visited);
		break;
	case "callExpr":
		visitCallExprRefs(state, expr, visited);
		break;
	case "call":
		visitCallRefs(state, expr, visited);
		break;
	case "ref":
		if (state.nodeMap.has(expr.id)) collectDeps(state, expr.id, visited);
		break;
	default:
		break;
	}
}

function visitLetRefs(
	state: BoundNodeState,
	expr: { value: string | Expr; body: string | Expr },
	visited: Set<string>,
): void {
	if (typeof expr.value === "string") {
		collectDeps(state, expr.value, visited);
	}
	if (typeof expr.body === "string") {
		collectDeps(state, expr.body, visited);
	}
}

function visitIfRefs(
	state: BoundNodeState,
	expr: { cond: string | Expr; then: string | Expr; else: string | Expr },
	visited: Set<string>,
): void {
	if (typeof expr.cond === "string") collectDeps(state, expr.cond, visited);
	if (typeof expr.then === "string") collectDeps(state, expr.then, visited);
	if (typeof expr.else === "string") collectDeps(state, expr.else, visited);
}

function visitCallExprRefs(
	state: BoundNodeState,
	expr: { fn: string; args: (string | Expr)[] },
	visited: Set<string>,
): void {
	if (state.nodeMap.has(expr.fn)) collectDeps(state, expr.fn, visited);
	for (const arg of expr.args) {
		if (typeof arg === "string" && state.nodeMap.has(arg)) collectDeps(state, arg, visited);
	}
}

function visitCallRefs(
	state: BoundNodeState,
	expr: { args: (string | Expr)[] },
	visited: Set<string>,
): void {
	for (const arg of expr.args) {
		if (typeof arg === "string" && state.nodeMap.has(arg)) {
			collectDeps(state, arg, visited);
		}
	}
}

/**
 * Identify "bound nodes" - nodes only reachable through lambda bodies.
 */
export function identifyBoundNodes(
	nodes: AirHybridNode[],
	nodeMap: Map<string, AirHybridNode>,
): Set<string> {
	const boundNodes = new Set<string>();
	const state: BoundNodeState = { boundNodes, nodeMap };

	const lambdaBodies = collectLambdaBodies(nodes);

	for (const bodyId of lambdaBodies) {
		collectDeps(state, bodyId, new Set<string>());
	}

	removeLambdaNodes(nodes, boundNodes);

	return boundNodes;
}

function collectLambdaBodies(nodes: AirHybridNode[]): Set<string> {
	const bodies = new Set<string>();
	for (const node of nodes) {
		if (isExprNode(node) && node.expr.kind === "lambda") {
			bodies.add(node.expr.body);
		}
	}
	return bodies;
}

function removeLambdaNodes(
	nodes: AirHybridNode[],
	boundNodes: Set<string>,
): void {
	for (const node of nodes) {
		if (isExprNode(node) && node.expr.kind === "lambda") {
			boundNodes.delete(node.id);
		}
	}
}
