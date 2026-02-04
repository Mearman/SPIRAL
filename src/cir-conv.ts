// CIRDocument ↔ Value Conversion Layer
// Bridges TypeScript CIRDocument type and CIR Value type for self-hosting

/* eslint-disable max-lines -- This file contains conversion functions for both CIR and EIR expressions */

import type {
	AIRDef,
	CIRDocument,
	CirBlock,
	CirHybridNode,
	Expr,
	Value,
	Type,
	EirExpr,
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
/* eslint-disable max-statements, complexity -- EIR expression conversion requires many condition checks */
function exprToValueCIR(expr: Expr | EirExpr): Value {
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
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return callExprToValueCIR(expr as Expr & { kind: "call" });
	}

	// For lambda expressions, convert to map structure with "s:" prefix
	if (expr.kind === "lambda") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return lambdaExprToValueCIR(expr as Expr & { kind: "lambda" });
	}

	// For EIR-specific expressions, convert to EIR format
	if (expr.kind === "seq") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirSeqExprToValueCIR(expr as EirExpr & { kind: "seq" });
	}
	if (expr.kind === "assign") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirAssignExprToValueCIR(expr as EirExpr & { kind: "assign" });
	}
	if (expr.kind === "while") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirWhileExprToValueCIR(expr as EirExpr & { kind: "while" });
	}
	if (expr.kind === "for") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirForExprToValueCIR(expr as EirExpr & { kind: "for" });
	}
	if (expr.kind === "iter") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirIterExprToValueCIR(expr as EirExpr & { kind: "iter" });
	}
	if (expr.kind === "effect") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirEffectExprToValueCIR(expr as EirExpr & { kind: "effect" });
	}
	if (expr.kind === "refCell") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirRefCellExprToValueCIR(expr as EirExpr & { kind: "refCell" });
	}
	if (expr.kind === "deref") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirDerefExprToValueCIR(expr as EirExpr & { kind: "deref" });
	}
	if (expr.kind === "try") {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return eirTryExprToValueCIR(expr as EirExpr & { kind: "try" });
	}

	// For other expressions, return as opaque value
	return opaqueVal("expr", expr);
}
/* eslint-enable max-statements, complexity */

// Expression conversion for raw format (no prefix, for round-trip)
/* eslint-disable max-statements -- Raw expression conversion requires multiple condition checks */
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
/* eslint-enable max-statements */

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

//==============================================================================
// EIR Expression Conversion Functions
//==============================================================================

// Helper function to convert string | Expr | EirExpr to Value
function exprOrRefToValue(exprOrRef: string | Expr | EirExpr): Value {
	if (typeof exprOrRef === "string") {
		return stringVal(exprOrRef);
	}
	return exprToValueCIR(exprOrRef);
}

// Helper function to convert Value back to string | Expr | EirExpr
// Note: Returns string | Expr | EirExpr, but EIR expressions expect string | Expr
// We use type assertions when assigning to EIR expression properties
function valueToExprOrRef(value: Value): string | Expr | EirExpr {
	if (value.kind === "string") {
		return value.value;
	}
	return valueToExpr(value);
}

function eirSeqExprToValueCIR(expr: EirExpr & { kind: "seq" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("seq"));
	map.set("s:first", exprOrRefToValue(expr.first));
	map.set("s:then", exprOrRefToValue(expr.then));
	return mapVal(map);
}

function eirAssignExprToValueCIR(expr: EirExpr & { kind: "assign" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("assign"));
	map.set("s:target", stringVal(expr.target));
	map.set("s:value", exprOrRefToValue(expr.value));
	return mapVal(map);
}

function eirWhileExprToValueCIR(expr: EirExpr & { kind: "while" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("while"));
	map.set("s:cond", exprOrRefToValue(expr.cond));
	map.set("s:body", exprOrRefToValue(expr.body));
	return mapVal(map);
}

function eirForExprToValueCIR(expr: EirExpr & { kind: "for" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("for"));
	map.set("s:var", stringVal(expr.var));
	map.set("s:init", exprOrRefToValue(expr.init));
	map.set("s:cond", exprOrRefToValue(expr.cond));
	map.set("s:update", exprOrRefToValue(expr.update));
	map.set("s:body", exprOrRefToValue(expr.body));
	return mapVal(map);
}

function eirIterExprToValueCIR(expr: EirExpr & { kind: "iter" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("iter"));
	map.set("s:var", stringVal(expr.var));
	map.set("s:iter", exprOrRefToValue(expr.iter));
	map.set("s:body", exprOrRefToValue(expr.body));
	return mapVal(map);
}

function eirEffectExprToValueCIR(expr: EirExpr & { kind: "effect" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("effect"));
	map.set("s:op", stringVal(expr.op));
	map.set("s:args", listVal(expr.args.map((arg: string | Expr | EirExpr) => exprOrRefToValue(arg))));
	return mapVal(map);
}

function eirRefCellExprToValueCIR(expr: EirExpr & { kind: "refCell" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("refCell"));
	map.set("s:target", stringVal(expr.target));
	return mapVal(map);
}

function eirDerefExprToValueCIR(expr: EirExpr & { kind: "deref" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("deref"));
	map.set("s:target", stringVal(expr.target));
	return mapVal(map);
}

function eirTryExprToValueCIR(expr: EirExpr & { kind: "try" }): Value {
	const map = new Map<string, Value>();
	map.set("s:kind", stringVal("try"));
	map.set("s:tryBody", exprOrRefToValue(expr.tryBody));
	map.set("s:catchParam", stringVal(expr.catchParam));
	map.set("s:catchBody", exprOrRefToValue(expr.catchBody));
	if (expr.fallback !== undefined) {
		map.set("s:fallback", exprOrRefToValue(expr.fallback));
	}
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

/* eslint-disable max-lines-per-function, max-statements, complexity -- Type conversion requires handling many type cases */
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
/* eslint-enable max-lines-per-function, max-statements, complexity */

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
/* eslint-disable max-statements -- Literal value conversion requires multiple type checks */

function valueToExprNode(id: string, map: Map<string, Value>): CirHybridNode {
	const exprVal = map.get("expr");
	if (!exprVal) {
		throw new Error(`Node "${id}" missing expr`);
	}
	// Type assertion: when converting CIR nodes, expressions are CIR Expr not EirExpr
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return { id, expr: valueToExpr(exprVal) as Expr };
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
/* eslint-enable max-statements */

/* eslint-disable max-statements -- Expression conversion requires multiple type checks */
function valueToExpr(value: Value): Expr | EirExpr {
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
/* eslint-enable max-statements */

/* eslint-disable max-statements, complexity -- Map expression conversion requires many kind checks */
function valueToMapExpr(value: { kind: "map"; value: Map<string, Value> }): Expr | EirExpr {
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

	// EIR expression kinds
	if (kind === "seq") {
		return valueToEirSeqExpr(value.value);
	}
	if (kind === "assign") {
		return valueToEirAssignExpr(value.value);
	}
	if (kind === "while") {
		return valueToEirWhileExpr(value.value);
	}
	if (kind === "for") {
		return valueToEirForExpr(value.value);
	}
	if (kind === "iter") {
		return valueToEirIterExpr(value.value);
	}
	if (kind === "effect") {
		return valueToEirEffectExpr(value.value);
	}
	if (kind === "refCell") {
		return valueToEirRefCellExpr(value.value);
	}
	if (kind === "deref") {
		return valueToEirDerefExpr(value.value);
	}
	if (kind === "try") {
		return valueToEirTryExpr(value.value);
	}

	throw new Error(`Unsupported map expression kind: "${kind}"`);
}
/* eslint-enable max-statements, complexity */

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
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return valueToExpr(arg) as Expr;
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

//==============================================================================
// Value → EIR Expression Conversion Functions
//==============================================================================

/**
 * Convert a Value to an EIR expression.
 * This function handles EIR-specific expression kinds.
 */
/* eslint-disable max-statements, complexity -- EIR expression conversion requires many kind checks */
export function valueToEirExpr(value: Value): EirExpr {
	// For string values, check if it's a ref or var
	if (value.kind === "string") {
		const str = value.value;
		if (str.startsWith("@")) {
			return { kind: "ref", id: str.slice(1) };
		}
		return { kind: "var", name: str };
	}

	// For literal values (int, bool, float), create literal expressions
	if (value.kind === "int") {
		return { kind: "lit", type: { kind: "int" }, value: value.value };
	}
	if (value.kind === "bool") {
		return { kind: "lit", type: { kind: "bool" }, value: value.value };
	}
	if (value.kind === "float") {
		return { kind: "lit", type: { kind: "float" }, value: value.value };
	}

	// For map values, delegate to specific handlers
	if (value.kind === "map") {
		const kindVal = value.value.get("kind");
		if (kindVal?.kind === "string") {
			const kind = kindVal.value;

			// EIR expression kinds
			if (kind === "seq") return valueToEirSeqExpr(value.value);
			if (kind === "assign") return valueToEirAssignExpr(value.value);
			if (kind === "while") return valueToEirWhileExpr(value.value);
			if (kind === "for") return valueToEirForExpr(value.value);
			if (kind === "iter") return valueToEirIterExpr(value.value);
			if (kind === "effect") return valueToEirEffectExpr(value.value);
			if (kind === "refCell") return valueToEirRefCellExpr(value.value);
			if (kind === "deref") return valueToEirDerefExpr(value.value);
			if (kind === "try") return valueToEirTryExpr(value.value);

			// CIR expression kinds (for compatibility)
			if (kind === "lit") return valueToLitExpr(value.value);
			if (kind === "call") return valueToCallExpr(value.value);
			if (kind === "lambda") return valueToLambdaExpr(value.value);
		}
	}

	throw new Error(`Cannot convert value to EIR expression: unsupported kind "${value.kind}"`);
}
/* eslint-enable max-statements, complexity */

/**
 * Get a field from a map, trying both prefixed and non-prefixed keys
 */
function getPrefixedField(map: Map<string, Value>, key: string): Value | undefined {
	// Try with "s:" prefix first (CIR format)
	if (map.has(`s:${key}`)) {
		return map.get(`s:${key}`);
	}
	// Try without prefix (raw format)
	return map.get(key);
}

/**
 * Get a required string field from a map
 */
function getStringFieldPrefixed(map: Map<string, Value>, key: string): string {
	const val = getPrefixedField(map, key);
	if (val?.kind !== "string") {
		throw new Error(`Expected string field "${key}" (with or without "s:" prefix)`);
	}
	return val.value;
}

function valueToEirSeqExpr(map: Map<string, Value>): EirExpr {
	const firstVal = getPrefixedField(map, "first");
	const thenVal = getPrefixedField(map, "then");

	if (!firstVal || !thenVal) {
		throw new Error("Seq expression must have 'first' and 'then' fields");
	}

	return {
		kind: "seq",
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		first: valueToExprOrRef(firstVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		then: valueToExprOrRef(thenVal) as string | Expr,
	};
}

function valueToEirAssignExpr(map: Map<string, Value>): EirExpr {
	const target = getStringFieldPrefixed(map, "target");
	const valueVal = getPrefixedField(map, "value");

	if (!valueVal) {
		throw new Error("Assign expression must have 'value' field");
	}

	return {
		kind: "assign",
		target,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		value: valueToExprOrRef(valueVal) as string | Expr,
	};
}

function valueToEirWhileExpr(map: Map<string, Value>): EirExpr {
	const condVal = getPrefixedField(map, "cond");
	const bodyVal = getPrefixedField(map, "body");

	if (!condVal || !bodyVal) {
		throw new Error("While expression must have 'cond' and 'body' fields");
	}

	return {
		kind: "while",
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		cond: valueToExprOrRef(condVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		body: valueToExprOrRef(bodyVal) as string | Expr,
	};
}

function valueToEirForExpr(map: Map<string, Value>): EirExpr {
	const varName = getStringFieldPrefixed(map, "var");
	const initVal = getPrefixedField(map, "init");
	const condVal = getPrefixedField(map, "cond");
	const updateVal = getPrefixedField(map, "update");
	const bodyVal = getPrefixedField(map, "body");

	if (!initVal || !condVal || !updateVal || !bodyVal) {
		throw new Error("For expression must have 'init', 'cond', 'update', and 'body' fields");
	}

	return {
		kind: "for",
		var: varName,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		init: valueToExprOrRef(initVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		cond: valueToExprOrRef(condVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		update: valueToExprOrRef(updateVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		body: valueToExprOrRef(bodyVal) as string | Expr,
	};
}

function valueToEirIterExpr(map: Map<string, Value>): EirExpr {
	const varName = getStringFieldPrefixed(map, "var");
	const iterVal = getPrefixedField(map, "iter");
	const bodyVal = getPrefixedField(map, "body");

	if (!iterVal || !bodyVal) {
		throw new Error("Iter expression must have 'iter' and 'body' fields");
	}

	return {
		kind: "iter",
		var: varName,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		iter: valueToExprOrRef(iterVal) as string | Expr,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		body: valueToExprOrRef(bodyVal) as string | Expr,
	};
}

function valueToEirEffectExpr(map: Map<string, Value>): EirExpr {
	const op = getStringFieldPrefixed(map, "op");
	const argsVal = getPrefixedField(map, "args");

	if (!argsVal || argsVal.kind !== "list") {
		throw new Error("Effect expression must have 'args' field as a list");
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const args = argsVal.value.map(arg => valueToExprOrRef(arg)) as (string | Expr)[];

	return {
		kind: "effect",
		op,
		args,
	};
}

function valueToEirRefCellExpr(map: Map<string, Value>): EirExpr {
	const target = getStringFieldPrefixed(map, "target");

	return {
		kind: "refCell",
		target,
	};
}

function valueToEirDerefExpr(map: Map<string, Value>): EirExpr {
	const target = getStringFieldPrefixed(map, "target");

	return {
		kind: "deref",
		target,
	};
}

function valueToEirTryExpr(map: Map<string, Value>): EirExpr {
	const tryBodyVal = getPrefixedField(map, "tryBody");
	const catchParam = getStringFieldPrefixed(map, "catchParam");
	const catchBodyVal = getPrefixedField(map, "catchBody");
	const fallbackVal = getPrefixedField(map, "fallback");

	if (!tryBodyVal || !catchBodyVal) {
		throw new Error("Try expression must have 'tryBody' and 'catchBody' fields");
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const result: EirExpr & { kind: "try" } = {
		kind: "try",
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		tryBody: valueToExprOrRef(tryBodyVal) as string | Expr,
		catchParam,
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		catchBody: valueToExprOrRef(catchBodyVal) as string | Expr,
	};

	// Add fallback if present
	if (fallbackVal !== undefined) {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		result.fallback = valueToExprOrRef(fallbackVal) as string | Expr;
	}

	return result;
}
