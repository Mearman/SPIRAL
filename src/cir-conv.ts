// CIRDocument ↔ Value Conversion Layer
// Bridges TypeScript CIRDocument type and CIR Value type for self-hosting

import type {
	AIRDef,
	CIRDocument,
	CirBlock,
	CirHybridNode,
	Expr,
	Value,
	Type,
} from "./types.ts";
import {
	stringVal,
	intVal,
	boolVal,
	floatVal,
	mapVal,
	listVal,
	opaqueVal,
	fnType,
	intType,
} from "./types.ts";

//==============================================================================
// CIRDocument → Value Conversion
//==============================================================================

/**
 * Convert a CIRDocument to a Value (MapVal) for use with CIR implementations.
 *
 * This converts the TypeScript CIRDocument object into a SPIRAL Value that
 * can be passed to CIR-implemented functions like meta:eval.
 *
 * Uses the "s:" prefix convention expected by CIR stdlib.
 */
export function cirDocumentToValue(doc: CIRDocument): Value {
	const map = new Map<string, Value>();

	// version: string (not used by CIR evaluators, but included for completeness)
	map.set("s:version", stringVal(doc.version));

	// airDefs: AirDef[] → list of opaque values (airDefs are metadata only)
	map.set("s:airDefs", listVal(
		doc.airDefs.map(airDefToValue)
	));

	// nodes: Node[] → list of map values (each node is a map)
	map.set("s:nodes", listVal(
		doc.nodes.map(nodeToValueCIR)
	));

	// result: string
	map.set("s:result", stringVal(doc.result));

	return mapVal(map);
}

/**
 * Convert a CIRDocument to a Value without "s:" prefix.
 * Used for round-trip conversion and TypeScript interop.
 */
export function cirDocumentToValueRaw(doc: CIRDocument): Value {
	const map = new Map<string, Value>();

	// version: string
	map.set("version", stringVal(doc.version));

	// airDefs: AirDef[] → list of opaque values (airDefs are metadata only)
	map.set("airDefs", listVal(
		doc.airDefs.map(airDefToValue)
	));

	// nodes: Node[] → list of map values (each node is a map)
	map.set("nodes", listVal(
		doc.nodes.map(nodeToValueRaw)
	));

	// result: string
	map.set("result", stringVal(doc.result));

	return mapVal(map);
}

function airDefToValue(airDef: AIRDef): Value {
	return opaqueVal("airDef", airDef);
}

// Node conversion for CIR stdlib (uses "s:" prefix)
function nodeToValueCIR(node: CirHybridNode): Value {
	const map = new Map<string, Value>();

	// id: string
	map.set("s:id", stringVal(node.id));

	// expr: Expr
	if ("expr" in node) {
		map.set("s:expr", exprToValueCIR(node.expr));
	}

	// type: Type (optional)
	if ("type" in node && node.type) {
		map.set("s:type", typeToValue(node.type));
	}

	// blocks: Block[] (for CFG nodes)
	if ("blocks" in node) {
		map.set("s:blocks", opaqueVal("blocks", node.blocks));
		map.set("s:entry", stringVal(node.entry));
	}

	return mapVal(map);
}

// Node conversion for raw format (no prefix, for round-trip)
function nodeToValueRaw(node: CirHybridNode): Value {
	const map = new Map<string, Value>();

	// id: string
	map.set("id", stringVal(node.id));

	// expr: Expr
	if ("expr" in node) {
		map.set("expr", exprToValueRaw(node.expr));
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

// Expression conversion for CIR stdlib (uses "s:" prefix)
function exprToValueCIR(expr: Expr): Value {
	// For literals, return the value directly with "s:" prefix
	if (expr.kind === "lit") {
		return litToValueCIR(expr);
	}

	// For refs, return map structure with "s:" prefix
	if (expr.kind === "ref") {
		const map = new Map<string, Value>();
		map.set("s:kind", stringVal("ref"));
		map.set("s:id", stringVal(expr.id));
		return mapVal(map);
	}

	// For vars, return string
	if (expr.kind === "var") {
		return stringVal(expr.name);
	}

	// For call expressions, convert to map structure with "s:" prefix
	if (expr.kind === "call") {
		return callExprToValueCIR(expr);
	}

	// For lambda expressions, convert to map structure with "s:" prefix
	if (expr.kind === "lambda") {
		return lambdaExprToValueCIR(expr);
	}

	// For other expressions, return as opaque value
	return opaqueVal("expr", expr);
}

// Expression conversion for raw format (no prefix, for round-trip)
function exprToValueRaw(expr: Expr): Value {
	// For literals, return the value directly
	if (expr.kind === "lit") {
		return litToValueRaw(expr);
	}

	// For refs, return string with @ prefix
	if (expr.kind === "ref") {
		return stringVal(`@${expr.id}`);
	}

	// For vars, return string
	if (expr.kind === "var") {
		return stringVal(expr.name);
	}

	// For call expressions, convert to map structure
	if (expr.kind === "call") {
		return callExprToValueRaw(expr);
	}

	// For lambda expressions, convert to map structure
	if (expr.kind === "lambda") {
		return lambdaExprToValueRaw(expr);
	}

	// For other expressions, return as opaque value
	return opaqueVal("expr", expr);
}

function litToValueCIR(expr: { kind: "lit"; type: { kind: string }; value: unknown }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("lit"));
	map.set("s:type", typeToValue(expr.type));
	map.set("s:value", litValueToValue(expr));
	return mapVal(map);
}

function litToValueRaw(expr: { kind: "lit"; type: { kind: string }; value: unknown }): Value {
	const map = new Map<string, Value>();
	map.set("kind", stringVal("lit"));
	map.set("value", litValueToValue(expr));
	return mapVal(map);
}

function litValueToValue(expr: { kind: "lit"; type: { kind: string }; value: unknown }): Value {
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

function callExprToValueCIR(expr: Expr & { kind: "call" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("call"));
	map.set("s:ns", stringVal(expr.ns));
	map.set("s:name", stringVal(expr.name));

	// Args are always strings (node references) for CIR format
	// If arg is an Expr, it should be converted to a node reference (opaque)
	map.set("s:args", listVal(expr.args.map(arg =>
		typeof arg === "string" ? stringVal(arg) : opaqueVal("arg", arg)
	)));

	return mapVal(map);
}

function callExprToValueRaw(expr: Expr & { kind: "call" }): Value {
	const map = new Map<string, Value>();
	map.set("kind", stringVal("call"));
	map.set("ns", stringVal(expr.ns));
	map.set("name", stringVal(expr.name));

	// Convert args to Value - strings become stringVal, Exprs become exprToValue
	const argsValues = expr.args.map(arg => {
		if (typeof arg === "string") {
			return stringVal(arg);
		}
		return exprToValueRaw(arg);
	});
	map.set("args", listVal(argsValues));

	return mapVal(map);
}

function lambdaExprToValueCIR(expr: Expr & { kind: "lambda" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("lambda"));

	// Convert params to list of strings
	const paramNames = expr.params.map(p => typeof p === "string" ? p : p.name);
	map.set("s:params", listVal(paramNames.map(stringVal)));
	map.set("s:body", stringVal(expr.body));

	// Store type
	map.set("s:type", typeToValue(expr.type));

	return mapVal(map);
}

function lambdaExprToValueRaw(expr: Expr & { kind: "lambda" }): Value {
	const map = new Map<string, Value>();
	map.set("kind", stringVal("lambda"));

	// Convert params to list of strings
	const paramNames = expr.params.map(p => typeof p === "string" ? p : p.name);
	map.set("params", listVal(paramNames.map(stringVal)));
	map.set("body", stringVal(expr.body));

	// Store type
	map.set("type", typeToValue(expr.type));

	return mapVal(map);
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

function valueToType(value: Value): Type {
	if (value.kind === "map") {
		const kindVal = value.value.get("kind");
		if (kindVal?.kind === "string") {
			const kind = kindVal.value;
			// Primitive types
			if (kind === "int") return intType;
			if (kind === "bool") return { kind: "bool" };
			if (kind === "string") return { kind: "string" };
			if (kind === "float") return { kind: "float" };
			if (kind === "void") return { kind: "void" };

			// Function type: { kind: "fn", params: Type[], returns: Type }
			if (kind === "fn") {
				const paramsVal = value.value.get("params");
				const returnsVal = value.value.get("returns");
				const params = paramsVal?.kind === "list" ? paramsVal.value.map(valueToType) : [];
				const returns = returnsVal ? valueToType(returnsVal) : intType;
				return { kind: "fn", params, returns };
			}

			// List type: { kind: "list", of: Type }
			if (kind === "list") {
				const ofVal = value.value.get("of");
				const elemVal = value.value.get("elem");
				const elementTypeVal = value.value.get("elementType");
				// Try multiple possible field names for element type
				const elem = ofVal ?? elemVal ?? elementTypeVal;
				return { kind: "list", of: elem ? valueToType(elem) : intType };
			}

			// Map type: { kind: "map", key: Type, value: Type }
			if (kind === "map") {
				const keyVal = value.value.get("key");
				const valueFieldVal = value.value.get("value");
				return {
					kind: "map",
					key: keyVal ? valueToType(keyVal) : intType,
					value: valueFieldVal ? valueToType(valueFieldVal) : intType,
				};
			}

			// Set type: { kind: "set", of: Type }
			if (kind === "set") {
				const ofVal = value.value.get("of");
				const elemVal = value.value.get("elem");
				const elementTypeVal = value.value.get("elementType");
				// Try multiple possible field names for element type
				const elem = ofVal ?? elemVal ?? elementTypeVal;
				return { kind: "set", of: elem ? valueToType(elem) : intType };
			}

			// Option type: { kind: "option", of: Type }
			if (kind === "option") {
				const ofVal = value.value.get("of");
				return { kind: "option", of: ofVal ? valueToType(ofVal) : intType };
			}

			// Ref type: { kind: "ref", of: Type }
			if (kind === "ref") {
				const ofVal = value.value.get("of");
				return { kind: "ref", of: ofVal ? valueToType(ofVal) : intType };
			}

			// Opaque type: { kind: "opaque", name: string }
			if (kind === "opaque") {
				const nameVal = value.value.get("name");
				if (nameVal?.kind === "string") {
					return { kind: "opaque", name: nameVal.value };
				}
			}
		}
	}
	// For opaque or other types, return a fallback int type
	return intType;
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

function valueToLitExpr(map: Map<string, Value>): Expr {
	const valueVal = map.get("value");
	if (!valueVal) {
		throw new Error("Literal expression must have 'value' field");
	}

	// Determine type based on the value kind
	if (valueVal.kind === "int") {
		return { kind: "lit", type: { kind: "int" }, value: valueVal.value };
	}
	if (valueVal.kind === "bool") {
		return { kind: "lit", type: { kind: "bool" }, value: valueVal.value };
	}
	if (valueVal.kind === "string") {
		return { kind: "lit", type: { kind: "string" }, value: valueVal.value };
	}
	if (valueVal.kind === "float") {
		return { kind: "lit", type: { kind: "float" }, value: valueVal.value };
	}

	// For other types, return a generic string literal
	// Note: OpaqueVal, ErrorVal, etc. have different properties
	if (valueVal.kind === "opaque") {
		return { kind: "lit", type: { kind: "string" }, value: valueVal.name };
	}
	if (valueVal.kind === "error") {
		return { kind: "lit", type: { kind: "string" }, value: valueVal.message };
	}

	// Fallback for unknown types - return 0 as a safe default
	return { kind: "lit", type: { kind: "int" }, value: 0 };
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

	// For map values, check if it's a structured expression
	if (value.kind === "map") {
		return valueToMapExpr(value);
	}

	// For opaque values, we can't reliably reconstruct without type assertions
	throw new Error(`Cannot convert value kind "${value.kind}" to Expr (opaque reconstruction not supported)`);
}

function valueToMapExpr(value: { kind: "map"; value: Map<string, Value> }): Expr {
	const kindVal = value.value.get("kind");
	if (kindVal?.kind !== "string") {
		throw new Error("Map expression must have string 'kind' field");
	}

	const kind = kindVal.value;

	if (kind === "lit") {
		return valueToLitExpr(value.value);
	}

	if (kind === "call") {
		return valueToCallExpr(value.value);
	}

	if (kind === "lambda") {
		return valueToLambdaExpr(value.value);
	}

	throw new Error(`Unsupported map expression kind: "${kind}"`);
}

function valueToCallExpr(map: Map<string, Value>): Expr {
	const nsVal = map.get("ns");
	const nameVal = map.get("name");
	const argsVal = map.get("args");

	if (nsVal?.kind !== "string" || nameVal?.kind !== "string" || argsVal?.kind !== "list") {
		throw new Error("Call expression must have ns (string), name (string), and args (list)");
	}

	const args = argsVal.value.map(arg => {
		// For string values (node references), return the string
		if (arg.kind === "string") {
			return arg.value;
		}
		// For other values (inline expressions), convert to Expr
		return valueToExpr(arg);
	});

	return { kind: "call", ns: nsVal.value, name: nameVal.value, args };
}

function valueToLambdaExpr(map: Map<string, Value>): Expr {
	const paramsVal = map.get("params");
	const bodyVal = map.get("body");
	const typeVal = map.get("type");

	if (paramsVal?.kind !== "list" || bodyVal?.kind !== "string") {
		throw new Error("Lambda expression must have params (list) and body (string)");
	}

	const params = paramsVal.value.map(param => {
		if (param.kind !== "string") {
			throw new Error("Lambda params must be strings");
		}
		return param.value;
	});

	// Reconstruct type if available, otherwise use fallback
	const type = typeVal ? valueToType(typeVal) : fnType([], intType);

	return { kind: "lambda", params, body: bodyVal.value, type };
}
