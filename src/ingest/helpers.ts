// Shared helpers for the ingest pipeline

import ts from "typescript";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	Type,
} from "../types.js";
import type { IngestNode, IngestState, Layer } from "./types.js";

// ---------- ID generation ----------

function freshIdFromBase(state: IngestState, base: string): string {
	if (!state.usedIds.has(base)) {
		state.usedIds.add(base);
		return base;
	}
	let counter = 1;
	while (state.usedIds.has(`${base}_${counter}`)) {
		counter++;
	}
	const id = `${base}_${counter}`;
	state.usedIds.add(id);
	return id;
}

function freshSynthId(state: IngestState): string {
	const id = `_e${state.nextSynthId}`;
	state.nextSynthId++;
	state.usedIds.add(id);
	return id;
}

export function freshId(state: IngestState, base?: string): string {
	return base ? freshIdFromBase(state, base) : freshSynthId(state);
}

// ---------- Node helpers ----------

export function addNode(
	state: IngestState,
	id: string,
	expr: unknown,
): string {
	state.nodes.push({ id, expr });
	return id;
}

export function addLitNode(
	state: IngestState,
	type: Type,
	value: unknown,
): string {
	const id = freshId(state);
	addNode(state, id, { kind: "lit", type, value });
	return id;
}

export function makeVoidNode(state: IngestState): string {
	const id = freshId(state);
	addNode(state, id, {
		kind: "lit",
		type: { kind: "void" },
		value: null,
	});
	return id;
}

export function makeVoidExpr(): { kind: string; type: Type; value: null } {
	return { kind: "lit", type: { kind: "void" }, value: null };
}

// ---------- Expression wrapping ----------

export function wrapInDoIfCall(expr: unknown): unknown {
	const isCall =
		expr &&
		typeof expr === "object" &&
		"kind" in expr &&
		expr.kind === "call";
	return isCall ? { kind: "do", exprs: [expr] } : expr;
}

// ---------- Type inference ----------

export function inferTypeFromAnnotation(
	typeNode: ts.TypeNode | undefined,
): Type {
	if (!typeNode) return { kind: "int" };

	const kindMap: Partial<Record<ts.SyntaxKind, Type>> = {
		[ts.SyntaxKind.NumberKeyword]: { kind: "int" },
		[ts.SyntaxKind.StringKeyword]: { kind: "string" },
		[ts.SyntaxKind.BooleanKeyword]: { kind: "bool" },
		[ts.SyntaxKind.VoidKeyword]: { kind: "void" },
	};

	return kindMap[typeNode.kind] ?? { kind: "int" };
}

export function inferReturnType(
	node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): Type {
	if (node.type) return inferTypeFromAnnotation(node.type);
	return { kind: "int" };
}

// ---------- String context ----------

export function isStringContext(node: ts.Node): boolean {
	return (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		ts.isTemplateExpression(node)
	);
}

// ---------- Operator mapping ----------

export interface OpMapping {
	ns: string;
	name: string;
}

const BINARY_OP_MAP: ReadonlyMap<ts.SyntaxKind, OpMapping> = new Map([
	[ts.SyntaxKind.MinusToken, { ns: "core", name: "sub" }],
	[ts.SyntaxKind.AsteriskToken, { ns: "core", name: "mul" }],
	[ts.SyntaxKind.SlashToken, { ns: "core", name: "div" }],
	[ts.SyntaxKind.PercentToken, { ns: "core", name: "mod" }],
	[ts.SyntaxKind.AsteriskAsteriskToken, { ns: "core", name: "pow" }],
	[ts.SyntaxKind.EqualsEqualsEqualsToken, { ns: "core", name: "eq" }],
	[ts.SyntaxKind.EqualsEqualsToken, { ns: "core", name: "eq" }],
	[ts.SyntaxKind.ExclamationEqualsEqualsToken, { ns: "core", name: "neq" }],
	[ts.SyntaxKind.ExclamationEqualsToken, { ns: "core", name: "neq" }],
	[ts.SyntaxKind.LessThanToken, { ns: "core", name: "lt" }],
	[ts.SyntaxKind.LessThanEqualsToken, { ns: "core", name: "lte" }],
	[ts.SyntaxKind.GreaterThanToken, { ns: "core", name: "gt" }],
	[ts.SyntaxKind.GreaterThanEqualsToken, { ns: "core", name: "gte" }],
	[ts.SyntaxKind.AmpersandAmpersandToken, { ns: "bool", name: "and" }],
	[ts.SyntaxKind.BarBarToken, { ns: "bool", name: "or" }],
]);

export function getBinaryOpMapping(
	op: ts.SyntaxKind,
	node: ts.BinaryExpression,
): OpMapping | undefined {
	if (op === ts.SyntaxKind.PlusToken) {
		const isString =
			isStringContext(node.left) || isStringContext(node.right);
		return isString
			? { ns: "string", name: "concat" }
			: { ns: "core", name: "add" };
	}
	return BINARY_OP_MAP.get(op);
}

// ---------- Document building ----------

interface BuildDocumentArgs {
	layer: Layer;
	version: string;
	nodes: IngestNode[];
	result: string;
}

function isSpiralDocument(
	_d: unknown,
): _d is AIRDocument | CIRDocument | EIRDocument {
	return true;
}

function toSpiralDocument(
	doc: unknown,
): AIRDocument | CIRDocument | EIRDocument {
	if (isSpiralDocument(doc)) return doc;
	throw new Error("Invalid SPIRAL document");
}

export function resolveExistingNodeId(state: IngestState, name: string): string | undefined {
	if (state.usedIds.has(name)) return name;
	if (name.startsWith("v_")) {
		const stripped = name.slice(2);
		if (state.usedIds.has(stripped)) return stripped;
	}
	return undefined;
}

export function buildDocument(
	args: BuildDocumentArgs,
): AIRDocument | CIRDocument | EIRDocument {
	const base = {
		version: args.version,
		airDefs: [],
		nodes: args.nodes,
		result: args.result,
	};

	return toSpiralDocument(base);
}
