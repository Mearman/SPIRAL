// SPDX-License-Identifier: MIT
// SPIRAL Shorthand Desugaring Pipeline
//
// This module transforms shorthand syntax in CIR documents into their verbose forms.
// It follows the pattern established by desugar-airdefs.ts, applying transforms
// before schema validation to maintain JSON Schema compatibility.
//
// Supported shorthands:
// 1. Inline literals: 42 -> {kind: "lit", type: {kind: "int"}, value: 42}
// 2. Lambda type inference: omit type -> infer all params as int, returns as int
// 3. Record field shorthand: {x: "y"} -> [{key: "x", value: "y"}]
// 4. Call syntax shorthand: op: "core:add" -> ns: "core", name: "add"

import type { Expr, Type } from "./types.js";

//==============================================================================
// Options
//==============================================================================

export interface ShorthandDesugarOptions {
	inlineLiterals?: boolean;
	inferLambdaTypes?: boolean;
	recordObjectShorthand?: boolean;
	callOpShorthand?: boolean;
}

//==============================================================================
// Helper Functions
//==============================================================================

/** Infer a Type from a primitive value for inline literal shorthand */
function inferTypeFromValue(val: unknown): Type {
	if (typeof val === "boolean") return { kind: "bool" };
	if (typeof val === "number") return { kind: "int" };
	if (typeof val === "string") return { kind: "string" };
	// Fallback for null/undefined/objects
	return { kind: "void" };
}

/** Check if a value is a primitive (number, boolean, string) for inline literal shorthand */
function isPrimitive(val: unknown): val is number | boolean | string {
	return typeof val === "number" || typeof val === "boolean" || typeof val === "string";
}

/** Type guard to check if value is an Expr (has kind property with valid expression kind) */
function isExpr(val: unknown): val is Expr {
	return typeof val === "object" && val !== null &&
		"kind" in val && typeof val.kind === "string";
}

/** Type guard to check if value is an expression node (has id and expr properties) */
function isExprNode(val: unknown): val is { id: string; expr: unknown } {
	return typeof val === "object" && val !== null &&
		"id" in val && typeof val.id === "string" &&
		"expr" in val;
}

/** Check if value is a record expression with object-format fields */
function isRecordWithObjectFields(
	val: unknown
): val is { kind: "record"; fields: Record<string, unknown>; type?: Type } {
	if (!isExpr(val) || val.kind !== "record") return false;
	return "fields" in val &&
		typeof val.fields === "object" &&
		!Array.isArray(val.fields);
}

/** Check if value is a lambda without type field */
function isLambdaWithoutType(val: unknown): val is { kind: "lambda"; params: unknown[]; body: string } {
	if (!isExpr(val) || val.kind !== "lambda") return false;
	return "params" in val &&
		Array.isArray(val.params) &&
		"body" in val &&
		typeof val.body === "string" &&
		!("type" in val);
}

/** Check if value is a call with op field instead of ns/name */
function isCallWithOp(val: unknown): val is { kind: "call"; op: string; args: unknown[] } {
	if (!isExpr(val) || val.kind !== "call") return false;
	return "op" in val &&
		typeof val.op === "string" &&
		!("ns" in val) &&
		!("name" in val);
}

/** Transform inline literals (42, true) into LitExpr */
function transformInlineLiteral(val: number | boolean | string): Expr {
	return {
		kind: "lit",
		type: inferTypeFromValue(val),
		value: val,
	};
}

/** Transform lambda without type into lambda with inferred type */
function transformLambdaType(lambda: { kind: "lambda"; params: unknown[]; body: string }): Expr {
	const paramTypes = lambda.params.map(() => ({ kind: "int" as const }));
	// Convert params to proper type - filter to strings only, then map to LambdaParam format
	const stringParams = lambda.params.filter((p): p is string => typeof p === "string");
	return {
		kind: "lambda",
		params: stringParams,
		body: lambda.body,
		type: { kind: "fn" as const, params: paramTypes, returns: { kind: "int" as const } }
	};
}

/** Transform record with object fields into record with array fields */
function transformRecordFields(
	record: { kind: "record"; fields: Record<string, unknown> }
): { kind: "record"; fields: { key: string; value: unknown }[] } {
	const fields = Object.entries(record.fields).map(([key, value]) => ({ key, value }));
	return { kind: "record", fields };
}

/** Transform call with op into call with ns/name */
function transformCallOp(call: { kind: "call"; op: string; args: unknown[] }): { kind: "call"; ns: string; name: string; args: unknown[] } {
	const colonIndex = call.op.indexOf(":");
	if (colonIndex === -1) {
		// Invalid op format, return minimal call (will fail validation later)
		return { kind: "call", ns: "", name: "", args: [] };
	}
	const ns = call.op.slice(0, colonIndex);
	const name = call.op.slice(colonIndex + 1);
	return { kind: "call", ns, name, args: call.args };
}

//==============================================================================
// Main Expression Desugaring
//==============================================================================

/** Convert unknown input to Expr, handling shorthands */
function toExpr(val: unknown, options: Required<ShorthandDesugarOptions>): Expr {
	// Handle null/undefined - return empty ref
	if (val === null || val === undefined) {
		return { kind: "ref", id: "" };
	}

	// DO NOT convert strings here - string refs are valid in CIR and should be preserved
	// This function is only called on top-level node expr values, which should be objects
	if (typeof val === "string") {
		// String at top level is invalid for CIR, but we preserve it for validation
		// (will be caught as invalid since it's not a proper Expr)
		return { kind: "ref", id: val };
	}

	// Check for inline literal shorthand (primitives at top level)
	if (options.inlineLiterals && isPrimitive(val)) {
		return transformInlineLiteral(val);
	}

	// At this point, should be an Expr object - use type guard
	if (isExpr(val)) {
		return val;
	}

	// Check if this is an object that looks like it's trying to be an expression
	// (has expression-like properties) but is missing the required 'kind' property.
	// In that case, preserve it as-is so validation can reject it.
	if (typeof val === "object" && val !== null && !Array.isArray(val)) {
		// Check for expression-like properties
		const hasExprProps = "type" in val || "value" in val || "params" in val ||
			"args" in val || "body" in val || "ns" in val || "name" in val;
		if (hasExprProps && !("kind" in val)) {
			// This looks like a malformed expression - preserve it for validation
			return val as Expr;
		}
	}

	// For other unknown values, create a lit with void type
	return { kind: "lit", type: { kind: "void" }, value: val };
}

/** Recursively transform an expression, applying all shorthand desugars */
function desugarExpr(val: unknown, options: Required<ShorthandDesugarOptions>): Expr {
	// Convert unknown to Expr first
	const expr = toExpr(val, options);

	// Transform based on expression kind - type narrowing happens here via the kind property
	switch (expr.kind) {
	case "lit":
	case "ref":
	case "var":
	case "airRef":
	case "predicate":
	case "fix":
	case "do":
		// These kinds don't need recursive desugaring - return as-is
		return expr;

	case "call": {
		// For invalid inputs (missing args), preserve as-is for validation to reject
		if (!("args" in expr) || !Array.isArray(expr.args)) {
			// Access ns/name safely using bracket notation for invalid inputs
			// Type assertion: intentionally preserving invalid structure for validation
			return {
				kind: "call",
				ns: ("ns" in expr && typeof expr.ns === "string") ? expr.ns : "",
				name: ("name" in expr && typeof expr.name === "string") ? expr.name : "",
			} as Expr;
		}
		// Check for call op shorthand and transform
		if (options.callOpShorthand && isCallWithOp(expr)) {
			const transformed = transformCallOp(expr);
			// Recursively desugar args - only desugar objects, preserve string refs
			return {
				...transformed,
				args: transformed.args.map(arg => typeof arg === "string" ? arg : desugarExpr(arg, options)),
			};
		}
		// Regular call - recursively desugar args (only objects, not strings)
		return {
			...expr,
			args: expr.args.map(arg => typeof arg === "string" ? arg : desugarExpr(arg, options)),
		};
	}

	case "if":
		return {
			...expr,
			// Only desugar if the value is an object - strings are valid node references
			cond: typeof expr.cond === "string" ? expr.cond : desugarExpr(expr.cond, options),
			then: typeof expr.then === "string" ? expr.then : desugarExpr(expr.then, options),
			else: typeof expr.else === "string" ? expr.else : desugarExpr(expr.else, options),
		};

	case "let":
		return {
			...expr,
			// value and body can be string refs (valid) or inline expressions (desugar them)
			value: typeof expr.value === "string" ? expr.value : desugarExpr(expr.value, options),
			body: typeof expr.body === "string" ? expr.body : desugarExpr(expr.body, options),
		};

	case "record": {
		// Check for record object shorthand
		if (options.recordObjectShorthand && isRecordWithObjectFields(expr)) {
			const transformed = transformRecordFields(expr);
			return {
				kind: "record",
				fields: transformed.fields.map(f => ({
					key: f.key,
					value: typeof f.value === "string" ? f.value : desugarExpr(f.value, options)
				})),
			};
		}
		// Regular record - recursively transform field values (only objects, not strings)
		return {
			...expr,
			fields: expr.fields.map(f => ({
				key: f.key,
				value: typeof f.value === "string" ? f.value : desugarExpr(f.value, options)
			})),
		};
	}

	case "listOf":
		return {
			...expr,
			elements: expr.elements.map(el => typeof el === "string" ? el : desugarExpr(el, options)),
		};

	case "match":
		return {
			...expr,
			value: typeof expr.value === "string" ? expr.value : desugarExpr(expr.value, options),
			cases: expr.cases.map(c => ({
				...c,
				body: typeof c.body === "string" ? c.body : desugarExpr(c.body, options)
			})),
			...(expr.default !== undefined ? { default: typeof expr.default === "string" ? expr.default : desugarExpr(expr.default, options) } : {}),
		};

	case "lambda":
		if (options.inferLambdaTypes && isLambdaWithoutType(expr)) {
			return transformLambdaType(expr);
		}
		// Lambda body is a string ref, not an expr - no recursion needed
		return expr;

	case "callExpr":
		return {
			...expr,
			args: expr.args.map(arg => typeof arg === "string" ? arg : desugarExpr(arg, options)),
		};

	default:
		// Unknown kind - this might be an EIR expression which doesn't need desugaring
		// EIR expressions use string references, not nested expressions
		return expr;
	}
}

//==============================================================================
// Main Desugaring Function
//==============================================================================

/**
 * Desugar shorthand syntax in a SPIRAL document.
 *
 * This function transforms shorthand forms into their verbose equivalents,
 * maintaining backward compatibility while enabling more concise documents.
 *
 * @param doc - The document to desugar (any SPIRAL document type)
 * @param options - Options to control which shorthands are enabled
 * @returns The desugared document (same type as input)
 */
export function desugarShorthands<T extends object>(
	doc: T,
	options: ShorthandDesugarOptions = {}
): T {
	const opts: Required<ShorthandDesugarOptions> = {
		inlineLiterals: true,
		inferLambdaTypes: true,
		recordObjectShorthand: true,
		callOpShorthand: true,
		...options
	};

	// If document has no nodes, return as-is
	if (doc === null || typeof doc !== "object" || !("nodes" in doc) || !Array.isArray(doc.nodes)) {
		return doc;
	}

	// Clone document to avoid mutation and transform nodes
	const transformedNodes = doc.nodes.map((node: unknown) => {
		// Check if this is an expression node (has id and expr properties)
		if (isExprNode(node)) {
			return {
				id: node.id,
				expr: desugarExpr(node.expr, opts),
			};
		}
		// Block nodes or other node types - pass through as-is
		return node;
	});

	return { ...doc, nodes: transformedNodes };
}
