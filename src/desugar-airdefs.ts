// Desugar airDefs/airRef to lambda/callExpr before evaluation.
// Each airDef becomes a lambda node; each airRef becomes a callExpr.

import type { AIRDef, Expr, Node, Type } from "./types.ts";

interface DocLike {
	airDefs: AIRDef[];
	nodes: Node[];
	[key: string]: unknown;
}

interface DefInfo { id: string; bodyId: string; def: AIRDef }
type DefMap = Map<string, DefInfo>;

/** Qualified key for an airDef: "__airdef_ns_name" (safe for node IDs). */
function airDefId(ns: string, name: string): string {
	return `__airdef_${ns}_${name}`;
}

/**
 * Desugar all airDefs into lambda nodes and replace airRef exprs with callExpr.
 * Returns a new document (does not mutate input).
 */
export function desugarAirDefs<T extends DocLike>(doc: T): T {
	if (doc.airDefs.length === 0) return doc;

	const defMap: DefMap = new Map();
	const syntheticNodes = buildSyntheticNodes(doc.airDefs, defMap);
	const rewrittenNodes = doc.nodes.map(node => {
		// Skip nodes with $ref (aliasing) - they don't have expr and will be resolved during evaluation
		// Skip block nodes - they use blocks instead of expr
		if ("$ref" in node || "blocks" in node) return node;
		return {
			...node,
			expr: rewriteExpr(node.expr, defMap),
		};
	});

	return { ...doc, airDefs: [], nodes: [...syntheticNodes, ...rewrittenNodes] };
}

function buildSyntheticNodes(airDefs: AIRDef[], defMap: DefMap): Node[] {
	const nodes: Node[] = [];
	for (const def of airDefs) {
		const id = airDefId(def.ns, def.name);
		const bodyId = id + "_body";
		defMap.set(def.ns + ":" + def.name, { id, bodyId, def });

		nodes.push({ id: bodyId, expr: def.body });

		const paramTypes: Type[] = def.params.map(() => ({ kind: "int" }));
		const lambdaExpr: Expr = {
			kind: "lambda",
			params: def.params,
			body: bodyId,
			type: { kind: "fn", params: paramTypes, returns: def.result },
		};
		nodes.push({ id, expr: lambdaExpr });
	}
	return nodes;
}

function rewriteExpr(expr: Expr, defMap: DefMap): Expr {
	if (expr.kind === "airRef") {
		const info = defMap.get(expr.ns + ":" + expr.name);
		if (!info) return expr;
		return { kind: "callExpr", fn: info.id, args: expr.args };
	}
	return rewriteChildren(expr, defMap);
}

function rewriteChildren(expr: Expr, defMap: DefMap): Expr {
	switch (expr.kind) {
	case "call":
		return { ...expr, args: rewriteArgs(expr.args, defMap) };
	case "callExpr":
		return { ...expr, args: rewriteArgs(expr.args, defMap) };
	case "if":
		return rewriteIfExpr(expr, defMap);
	case "let":
		return { ...expr, value: rewriteArg(expr.value, defMap), body: rewriteArg(expr.body, defMap) };
	case "match":
		return rewriteMatchExpr(expr, defMap);
	case "record":
		return rewriteRecordExpr(expr, defMap);
	case "listOf":
		return { ...expr, elements: rewriteArgs(expr.elements, defMap) };
	case "do":
		return { ...expr, exprs: rewriteArgs(expr.exprs, defMap) };
	case "lambda":
		// Lambda body is always a string node reference, never needs rewriting
		return expr;
	case "fix":
		// Fix fn is always a string node reference, never needs rewriting
		return expr;
	default:
		return expr;
	}
}

function rewriteIfExpr(expr: Expr & { kind: "if" }, defMap: DefMap): Expr {
	return {
		...expr,
		cond: rewriteArg(expr.cond, defMap),
		then: rewriteArg(expr.then, defMap),
		else: rewriteArg(expr.else, defMap),
	};
}

function rewriteMatchExpr(expr: Expr & { kind: "match" }, defMap: DefMap): Expr {
	return {
		...expr,
		value: rewriteArg(expr.value, defMap),
		cases: expr.cases.map(c => ({ ...c, body: rewriteArg(c.body, defMap) })),
		...(expr.default != null ? { default: rewriteArg(expr.default, defMap) } : {}),
	};
}

function rewriteRecordExpr(expr: Expr & { kind: "record" }, defMap: DefMap): Expr {
	return {
		...expr,
		fields: expr.fields.map(f => ({ ...f, value: rewriteArg(f.value, defMap) })),
	};
}

function rewriteArgs(args: (string | Expr)[], defMap: DefMap): (string | Expr)[] {
	return args.map(a => rewriteArg(a, defMap));
}

function rewriteArg(arg: string | Expr, defMap: DefMap): string | Expr {
	if (typeof arg === "string") return arg;
	return rewriteExpr(arg, defMap);
}
