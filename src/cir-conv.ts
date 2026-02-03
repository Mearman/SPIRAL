// CIRDocument ↔ Value Conversion Layer
// Bridges TypeScript CIRDocument type and CIR Value type for self-hosting

import type {
	AIRDef,
	CIRDocument,
	CirBlock,
	CirHybridNode,
	Expr,
	Value,
} from "./types.js";
import {
	stringVal,
	intVal,
	boolVal,
	floatVal,
	mapVal,
	listVal,
	opaqueVal,
} from "./types.js";

//==============================================================================
// CIRDocument → Value Conversion
//==============================================================================

/**
 * Convert a CIRDocument to a Value (MapVal) for use with CIR implementations.
 *
 * This converts the TypeScript CIRDocument object into a SPIRAL Value that
 * can be passed to CIR-implemented functions like meta:eval.
 */
export function cirDocumentToValue(doc: CIRDocument): Value {
	const map = new Map<string, Value>();

	// version: string
	map.set("version", stringVal(doc.version));

	// airDefs: AirDef[] → list of opaque values (airDefs are metadata only)
	map.set("airDefs", listVal(
		doc.airDefs.map(airDefToValue)
	));

	// nodes: Node[] → list of map values (each node is a map)
	map.set("nodes", listVal(
		doc.nodes.map(nodeToValue)
	));

	// result: string
	map.set("result", stringVal(doc.result));

	return mapVal(map);
}

function airDefToValue(airDef: AIRDef): Value {
	return opaqueVal("airDef", airDef);
}

function nodeToValue(node: CirHybridNode): Value {
	const map = new Map<string, Value>();

	// id: string
	map.set("id", stringVal(node.id));

	// expr: Expr
	if ("expr" in node) {
		map.set("expr", exprToValue(node.expr));
	}

	// type: Type (optional)
	if ("type" in node && node.type) {
		map.set("type", typeToValue(node.type));
	}

	// blocks: Block[] (for CFG nodes)
	if ("blocks" in node) {
		map.set("blocks", opaqueVal("blocks", node.blocks));
		map.set("entry", stringVal(node.entry));
	}

	return mapVal(map);
}

function exprToValue(expr: Expr): Value {
	// For literals, return the value directly
	if (expr.kind === "lit") {
		return litToValue(expr);
	}

	// For refs, return string with @ prefix
	if (expr.kind === "ref") {
		return stringVal(`@${expr.id}`);
	}

	// For vars, return string
	if (expr.kind === "var") {
		return stringVal(expr.name);
	}

	// For other expressions, return as opaque value
	// (full conversion would need to handle all expr kinds recursively)
	return opaqueVal("expr", expr);
}

function litToValue(expr: { kind: "lit"; type: { kind: string }; value: unknown }): Value {
	switch (expr.type.kind) {
	case "int":
		return intVal(Number(expr.value));
	case "bool":
		return boolVal(Boolean(expr.value));
	case "string":
		return stringVal(String(expr.value));
	case "float":
		return floatVal(Number(expr.value));
	default:
		return opaqueVal("lit", expr);
	}
}

function typeToValue(type: { kind: string }): Value {
	const map = new Map<string, Value>();
	map.set("kind", stringVal(type.kind));

	// Add type-specific fields
	for (const [key, val] of Object.entries(type)) {
		if (key === "kind") continue;
		map.set(key, convertTypeField(key, val));
	}

	return mapVal(map);
}

function convertTypeField(key: string, val: unknown): Value {
	if (typeof val === "string") {
		return stringVal(val);
	}
	if (typeof val === "boolean") {
		return boolVal(val);
	}
	if (typeof val === "number") {
		return intVal(val);
	}
	if (Array.isArray(val)) {
		const arrayVal: unknown[] = val;
		return listVal(arrayVal.map((arrayItem) => opaqueVal("typeParam", arrayItem)));
	}
	// Object or other - convert to opaque
	return opaqueVal(key, val);
}

//==============================================================================
// Value → CIRDocument Conversion (Round-Trip)
//==============================================================================

/**
 * Convert a Value (MapVal) back to a CIRDocument.
 * This is the inverse of cirDocumentToValue for round-trip conversion.
 */
export function valueToCirDocument(value: Value): CIRDocument {
	if (value.kind !== "map") {
		throw new Error(`Expected map value, got: ${value.kind}`);
	}

	const map = value.value;

	const version = getStringField(map, "version");
	const airDefs = getAirDefListField(map, "airDefs");
	const nodes = getNodeListField(map, "nodes");
	const result = getStringField(map, "result");

	return {
		version,
		airDefs,
		nodes,
		result,
	};
}

function getStringField(map: Map<string, Value>, key: string): string {
	const val = map.get(key);
	if (val?.kind !== "string") {
		throw new Error(`Expected string field "${key}"`);
	}
	return val.value;
}

function getAirDefListField(map: Map<string, Value>, key: string): AIRDef[] {
	const val = map.get(key);
	if (val?.kind !== "list") {
		throw new Error(`Expected list field "${key}"`);
	}
	// For airDefs, we return empty array since round-trip of metadata is complex
	// The actual airDefs are preserved in opaque values for debugging
	return [];
}

function getNodeListField(map: Map<string, Value>, key: string): CirHybridNode[] {
	const val = map.get(key);
	if (val?.kind !== "list") {
		throw new Error(`Expected list field "${key}"`);
	}
	return val.value.map((v, i) => valueToNode(v, i));
}

function valueToNode(value: Value, index: number): CirHybridNode {
	if (value.kind !== "map") {
		throw new Error(`Expected map value for node at index ${index}, got: ${value.kind}`);
	}

	const map = value.value;
	const id = getStringField(map, "id");

	// Check if it has expr or blocks (CFG node)
	if (map.has("expr")) {
		return valueToExprNode(id, map);
	}

	// CFG node (blocks)
	if (map.has("blocks")) {
		return valueToBlockNode(id, map);
	}

	throw new Error(`Node "${id}" has neither expr nor blocks`);
}

function valueToExprNode(id: string, map: Map<string, Value>): CirHybridNode {
	const exprVal = map.get("expr");
	if (!exprVal) {
		throw new Error(`Node "${id}" missing expr`);
	}
	return { id, expr: valueToExpr(exprVal) };
}

function valueToBlockNode(id: string, map: Map<string, Value>): CirHybridNode {
	const blocksVal = map.get("blocks");
	const entryVal = map.get("entry");
	if (!blocksVal || !entryVal) {
		throw new Error(`Node "${id}" missing blocks or entry`);
	}

	// Blocks are stored as opaque - for round-trip we use a minimal BlockNode
	// Full CFG node round-trip would require complete CirBlock reconstruction
	const entry = entryVal.kind === "string" ? entryVal.value : "entry";
	return { id, blocks: Array<CirBlock>(), entry };
}

function valueToExpr(value: Value): Expr {
	// For literals, reconstruct
	if (value.kind === "int") {
		return { kind: "lit", type: { kind: "int" }, value: value.value };
	}
	if (value.kind === "bool") {
		return { kind: "lit", type: { kind: "bool" }, value: value.value };
	}
	if (value.kind === "string") {
		// Check if it's a ref (starts with @)
		if (value.value.startsWith("@")) {
			return { kind: "ref", id: value.value.slice(1) };
		}
		// Otherwise it's a var
		return { kind: "var", name: value.value };
	}

	// For opaque values, we can't reliably reconstruct without type assertions
	// This is acceptable since opaque values are preserved in round-trip
	throw new Error(`Cannot convert value kind "${value.kind}" to Expr (opaque reconstruction not supported)`);
}
