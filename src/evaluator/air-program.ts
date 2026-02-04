// AIR/CIR program-level evaluation (evaluateProgram)

import {
	type Defs,
	type ValueEnv,
	emptyValueEnv,
} from "../env.ts";
import { ErrorCodes } from "../errors.ts";
import {
	type AIRDocument,
	type AirHybridNode,
	type Expr,
	type Value,
	isBlockNode,
	isExprNode,
	isRefNode,
} from "../types.ts";
import { errorVal, isError } from "../types.ts";
import type { AirEvalCtx, EvalOptions } from "./types.ts";
import { Evaluator } from "./helpers.ts";
import { evalNode } from "./air-node.ts";
import { desugarAirDefs } from "../desugar-airdefs.ts";
import { desugarShorthands } from "../desugar-shorthands.ts";
import { transpileImports } from "../desugar/transpile-imports.ts";

export { Evaluator };

//==============================================================================
// Public entry point
//==============================================================================

export interface ProgramCtx extends AirEvalCtx {
	evaluator: Evaluator;
}

interface ProgramArgs {
	doc: AIRDocument;
	registry: AirEvalCtx["registry"];
	defs: Defs;
	inputs?: Map<string, Value> | undefined;
	options?: EvalOptions | undefined;
}

/** Evaluate a full AIR/CIR program. */
export function evaluateProgram(
	...params: [AIRDocument, AirEvalCtx["registry"], Defs, Map<string, Value>?, EvalOptions?]
): Value {
	// Transpile $imports to $defs first (must happen before shorthands desugaring)
	const withDefs = transpileImports(params[0]);
	// Desugar shorthands (inline literals, lambda type inference, etc.)
	const desugared1 = desugarShorthands(withDefs);
	// Desugar airDefs (convert airDefs to lambdas/callExprs)
	// Type assertion: desugared1 is structurally compatible with desugarAirDefs DocLike
	const desugared2 = desugarAirDefs(desugared1 as unknown as Parameters<typeof desugarAirDefs>[0]);
	const args: ProgramArgs = { doc: desugared2 as unknown as AIRDocument, registry: params[1], defs: params[2], inputs: params[3], options: params[4] };
	const ctx = buildProgramCtx(args);
	const boundNodes = computeBoundNodes(args.doc, ctx.nodeMap);
	return runProgram({ doc: args.doc, ctx, boundNodes, inputs: args.inputs });
}

//==============================================================================
// Internals
//==============================================================================

function buildProgramCtx(args: ProgramArgs): ProgramCtx {
	const nodeMap = new Map<string, AirHybridNode>();
	for (const node of args.doc.nodes) nodeMap.set(node.id, node);
	return {
		evaluator: new Evaluator(args.registry, args.defs),
		registry: args.registry, defs: args.defs, nodeMap,
		nodeValues: new Map<string, Value>(),
		options: args.options,
		docDefs: getDocRoot(args.doc),
	};
}

/** Get the full document root for JSON Pointer navigation. */
function getDocRoot(doc: AIRDocument): Record<string, unknown> {
	// Extract $defs safely using property checking
	const defs: Record<string, unknown> = {};
	if ("$defs" in doc && typeof doc.$defs === "object" && doc.$defs !== null) {
		const docDefs = doc.$defs;
		for (const [key, value] of Object.entries(docDefs)) {
			defs[key] = value;
		}
	}
	return {
		$defs: defs,
		nodes: doc.nodes,
		result: doc.result,
		version: doc.version,
	};
}

interface RunCtx {
	doc: AIRDocument;
	ctx: ProgramCtx;
	boundNodes: Set<string>;
	inputs?: Map<string, Value> | undefined;
}

function runProgram(rc: RunCtx): Value {
	let env = rc.inputs ?? emptyValueEnv();
	for (const node of rc.doc.nodes) {
		if (rc.boundNodes.has(node.id)) continue;
		const result = evalNode(rc.ctx, node, env);
		rc.ctx.nodeValues.set(node.id, result.value);
		if (isError(result.value)) return result.value;
		env = result.env;
	}
	return resolveResult(rc.doc, rc.ctx, env);
}

function resolveResult(
	doc: AIRDocument,
	ctx: ProgramCtx,
	env: ValueEnv,
): Value {
	const resultValue = ctx.nodeValues.get(doc.result);
	if (resultValue) return resultValue;
	const resultNode = ctx.nodeMap.get(doc.result);
	if (resultNode) return evalNode(ctx, resultNode, env).value;
	return errorVal(ErrorCodes.DomainError, "Result node not evaluated: " + doc.result);
}

//==============================================================================
// Bound node computation
//==============================================================================

interface BoundCtx {
	doc: AIRDocument;
	bound: Set<string>;
	nodeMap: Map<string, AirHybridNode>;
}

export function computeBoundNodes(
	doc: AIRDocument,
	nodeMap: Map<string, AirHybridNode>,
): Set<string> {
	const bound = new Set<string>();
	const bc: BoundCtx = { doc, bound, nodeMap };
	const lambdaParams = collectLambdaParams(doc);
	markInitialBound(bc, lambdaParams);
	markTransitiveBound(bc);
	markRefToBound(bc);
	return bound;
}

function collectLambdaParams(doc: AIRDocument): Set<string> {
	const params = new Set<string>();
	for (const node of doc.nodes) {
		if (!isExprNode(node)) continue;
		if (node.expr.kind !== "lambda") continue;
		if (!Array.isArray(node.expr.params)) continue;
		for (const p of node.expr.params) {
			if (typeof p === "string") params.add(p);
		}
	}
	return params;
}

function usesLambdaParams(expr: Expr, params: Set<string>): boolean {
	return checkCallExprParams(expr, params)
		|| checkCallParams(expr, params)
		|| checkRefParams(expr, params);
}

function checkCallExprParams(expr: Expr, params: Set<string>): boolean {
	if (expr.kind !== "callExpr") return false;
	if (typeof expr.fn === "string" && params.has(expr.fn)) return true;
	return expr.args.some(a => typeof a === "string" && params.has(a));
}

function checkCallParams(expr: Expr, params: Set<string>): boolean {
	if (expr.kind !== "call") return false;
	return expr.args.some(a => typeof a === "string" && params.has(a));
}

function checkRefParams(expr: Expr, params: Set<string>): boolean {
	return expr.kind === "ref" && params.has(expr.id);
}

function isTrivalNode(node: AirHybridNode | undefined): boolean {
	if (!node) return true;
	if (isBlockNode(node)) return false;
	if (isRefNode(node)) return false;
	if (!isExprNode(node)) return false;
	return node.expr.kind === "lit";
}

function markInitialBound(bc: BoundCtx, lambdaParams: Set<string>): void {
	for (const node of bc.doc.nodes) {
		if (isBlockNode(node) || isRefNode(node)) continue;
		if (!isExprNode(node)) continue;
		const expr = node.expr;
		if (expr.kind === "lambda" && typeof expr.body === "string") {
			markBoundRecursively(expr.body, bc.bound, bc.nodeMap);
		}
		if (usesLambdaParams(expr, lambdaParams)) bc.bound.add(node.id);
		if (expr.kind === "var") bc.bound.add(node.id);
	}
}

function markBoundRecursively(
	nodeId: string,
	bound: Set<string>,
	nodeMap: Map<string, AirHybridNode>,
): void {
	if (bound.has(nodeId)) return;
	const node = nodeMap.get(nodeId);
	if (!node || isTrivalNode(node) || isRefNode(node)) return;
	bound.add(nodeId);
	if (isBlockNode(node)) return;
	if (!isExprNode(node)) return;
	if (node.expr.kind === "let") {
		if (typeof node.expr.body === "string") markBoundRecursively(node.expr.body, bound, nodeMap);
	}
	if (node.expr.kind === "if") {
		if (typeof node.expr.then === "string") markBoundRecursively(node.expr.then, bound, nodeMap);
		if (typeof node.expr.else === "string") markBoundRecursively(node.expr.else, bound, nodeMap);
	}
	if (node.expr.kind === "match") {
		for (const c of node.expr.cases) {
			if (typeof c.body === "string") markBoundRecursively(c.body, bound, nodeMap);
		}
		if (typeof node.expr.default === "string") markBoundRecursively(node.expr.default, bound, nodeMap);
	}
}

function usesBoundNodes(expr: Expr, bound: Set<string>): boolean {
	if (expr.kind === "call") {
		return expr.args.some(a => typeof a === "string" && bound.has(a));
	}
	if (expr.kind === "callExpr") {
		if (bound.has(expr.fn)) return true;
		return expr.args.some(a => typeof a === "string" && bound.has(a));
	}
	if (expr.kind === "ref") return bound.has(expr.id);
	if (expr.kind === "if") {
		return [expr.cond, expr.then, expr.else].some(
			id => typeof id === "string" && bound.has(id),
		);
	}
	if (expr.kind === "match") {
		if (typeof expr.value === "string" && bound.has(expr.value)) return true;
		if (expr.cases.some(c => typeof c.body === "string" && bound.has(c.body))) return true;
		if (typeof expr.default === "string" && bound.has(expr.default)) return true;
		return false;
	}
	if (expr.kind === "record") {
		return expr.fields.some(f => typeof f.value === "string" && bound.has(f.value));
	}
	if (expr.kind === "listOf") {
		return expr.elements.some(e => typeof e === "string" && bound.has(e));
	}
	if (expr.kind === "lambda") {
		return typeof expr.body === "string" && bound.has(expr.body);
	}
	if (expr.kind === "fix") {
		return typeof expr.fn === "string" && bound.has(expr.fn);
	}
	if (expr.kind === "let") {
		return [expr.value, expr.body].some(
			id => typeof id === "string" && bound.has(id),
		);
	}
	if (expr.kind === "do") {
		return expr.exprs.some(e => typeof e === "string" && bound.has(e));
	}
	return false;
}

function markTransitiveBound(bc: BoundCtx): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (const node of bc.doc.nodes) {
			if (bc.bound.has(node.id) || isTrivalNode(node) || isBlockNode(node) || isRefNode(node)) continue;
			if (!isExprNode(node)) continue;
			if (usesBoundNodes(node.expr, bc.bound)) {
				bc.bound.add(node.id);
				changed = true;
			}
		}
	}
}

function markRefToBound(bc: BoundCtx): void {
	for (const node of bc.doc.nodes) {
		if (isBlockNode(node) || isRefNode(node)) continue;
		if (!isExprNode(node)) continue;
		if (node.expr.kind !== "ref") continue;
		const refNode = bc.nodeMap.get(node.expr.id);
		if (!refNode || !isExprNode(refNode)) continue;
		if (refNode.expr.kind === "var" || refNode.expr.kind === "call") {
			bc.bound.add(node.id);
		}
	}
}
