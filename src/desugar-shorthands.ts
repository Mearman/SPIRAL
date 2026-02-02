// SPDX-License-Identifier: MIT
// SPIRAL Shorthand Desugaring Pipeline
//
// This module transforms shorthand syntax in CIR documents into their verbose forms.
// It follows the pattern established by desugar-airdefs.ts, applying transforms
// before schema validation to maintain JSON Schema compatibility.
//
// Supported shorthands:
// 1. Inline literals: 42 → {kind: "lit", type: {kind: "int"}, value: 42}
// 2. Lambda type inference: omit type → infer all params as int, returns as int
// 3. Record field shorthand: {x: "y"} → [{key: "x", value: "y"}]
// 4. Call syntax shorthand: op: "core:add" → ns: "core", name: "add"

import type { DocLike, Expr, Node, Type } from "./types.js";

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

/** Check if an object has a specific kind property */
function hasKind(val: unknown, kind: string): val is { kind: string } {
	if (typeof val !== "object" || val === null) return false;
	return "kind" in val && (val as { kind: string }).kind === kind;
}

/** Check if value is a record expression with object-format fields */
function isRecordWithObjectFields(val: unknown): val is { kind: "record"; fields: Record<string, unknown>; type?: Type } {
	if (!hasKind(val, "record")) return false;
	const record = val as { kind: "record"; fields: unknown };
	return "fields" in record &&
		typeof record.fields === "object" &&
		record.fields !== null &&
		!Array.isArray(record.fields);
}

/** Check if value is a lambda without type field */
function isLambdaWithoutType(val: unknown): val is { kind: "lambda"; params: unknown[]; body: string } {
	if (!hasKind(val, "lambda")) return false;
	return !("type" in (val as Record<string, unknown>));
}

/** Check if value is a call with op field instead of ns/name */
function isCallWithOp(val: unknown): val is { kind: "call"; op: string; args: unknown[] } {
	if (!hasKind(val, "call")) return false;
	const call = val as Record<string, unknown>;
	return "op" in call && !("ns" in call) && !("name" in call);
}

//==============================================================================
// Transform Functions
//==============================================================================

/** Transform inline literals (42, true) into LitExpr */
function transformInlineLiteral(val: number | boolean | string): Expr {
	return {
		kind: "lit",
		type: inferTypeFromValue(val),
		value: val,
	};
}

/** Transform lambda without type into lambda with inferred type */
function transformLambdaType(expr: { kind: "lambda"; params: unknown[]; body: string }): Expr {
	const paramTypes = expr.params.map(() => ({ kind: "int" as const }));
	return {
		...expr,
		type: { kind: "fn" as const, params: paramTypes, returns: { kind: "int" as const } }
	};
}

/** Transform record with object fields into record with array fields */
function transformRecordFields(expr: { kind: "record"; fields: Record<string, unknown>; type?: Type }): Expr {
	const fields = Object.entries(expr.fields).map(([key, value]) => ({ key, value }));
	return {
		...expr,
		fields,
	};
}

/** Transform call with op into call with ns/name */
function transformCallOp(call: { kind: "call"; op: string; args: unknown[] }): Expr {
	const [ns, name] = call.op.split(":");
	return {
		kind: "call",
		ns,
		name,
		args: call.args,
	};
}

//==============================================================================
// Expression Desugaring by Kind
//==============================================================================

/** Desugar a call expression */
function desugarCall(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if (options.callOpShorthand && isCallWithOp(obj)) {
		const transformed = transformCallOp(obj as { kind: "call"; op: string; args: unknown[] });
		return {
			...transformed,
			args: transformed.args.map((arg) => desugarExpr(arg, options))
		};
	}
	// Recursively transform args
	if ("args" in obj && Array.isArray(obj.args)) {
		obj.args = obj.args.map((arg) => desugarExpr(arg, options));
	}
	return obj as Expr;
}

/** Desugar an if expression */
function desugarIf(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if ("cond" in obj) obj.cond = desugarExpr(obj.cond, options);
	if ("then" in obj) obj.then = desugarExpr(obj.then, options);
	if ("else" in obj) obj.else = desugarExpr(obj.else, options);
	return obj as Expr;
}

/** Desugar a let expression */
function desugarLet(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if ("value" in obj) obj.value = desugarExpr(obj.value, options);
	if ("body" in obj) obj.body = desugarExpr(obj.body, options);
	return obj as Expr;
}

/** Desugar a record expression */
function desugarRecord(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if (options.recordObjectShorthand && isRecordWithObjectFields(obj)) {
		const transformed = transformRecordFields(obj as { kind: "record"; fields: Record<string, unknown>; type?: Type });
		// Recursively transform field values
		const fields = transformed.fields.map((f) => ({
			key: f.key,
			value: desugarExpr(f.value, options)
		}));
		return { ...transformed, fields };
	}
	// Recursively transform field values
	if ("fields" in obj && Array.isArray(obj.fields)) {
		obj.fields = obj.fields.map((f: { key: string; value: unknown }) => ({
			key: f.key,
			value: desugarExpr(f.value, options)
		}));
	}
	return obj as Expr;
}

/** Desugar a listOf expression */
function desugarListOf(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if ("elements" in obj && Array.isArray(obj.elements)) {
		obj.elements = obj.elements.map((el) => desugarExpr(el, options));
	}
	return obj as Expr;
}

/** Desugar a match expression */
function desugarMatch(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if ("value" in obj) obj.value = desugarExpr(obj.value, options);
	if ("cases" in obj && Array.isArray(obj.cases)) {
		obj.cases = obj.cases.map((c: { pattern: string; body: unknown }) => ({
			pattern: c.pattern,
			body: desugarExpr(c.body, options)
		}));
	}
	if ("default" in obj && obj.default !== undefined) {
		obj.default = desugarExpr(obj.default, options);
	}
	return obj as Expr;
}

/** Desugar a callExpr expression */
function desugarCallExpr(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	if ("fn" in obj && "args" in obj && Array.isArray(obj.args)) {
		obj.args = obj.args.map((arg) => desugarExpr(arg, options));
	}
	return obj as Expr;
}

/** Desugar generic expression with nested properties */
function desugarGeneric(obj: Record<string, unknown>, options: ShorthandDesugarOptions): Expr {
	for (const key of Object.keys(obj)) {
		if (key === "type") continue; // Skip type annotations
		const value = obj[key];
		if (Array.isArray(value)) {
			obj[key] = value.map((item) => desugarExpr(item, options));
		} else if (typeof value === "object" && value !== null) {
			obj[key] = desugarExpr(value, options);
		}
	}
	return obj as Expr;
}

//==============================================================================
// Main Expression Desugaring
//==============================================================================

/** Recursively transform an expression, applying all shorthand desugars */
function desugarExpr(expr: unknown, options: ShorthandDesugarOptions): Expr {
	// Handle null/undefined/string refs (pass through)
	if (expr === null || expr === undefined || typeof expr === "string") {
		return expr as Expr;
	}

	// Check for inline literal shorthand
	if (options.inlineLiterals && isPrimitive(expr)) {
		return transformInlineLiteral(expr);
	}

	// Must be an object with kind property
	if (typeof expr !== "object" || !("kind" in expr)) {
		return expr as Expr;
	}

	const obj = { ...expr } as Record<string, unknown>;

	// Transform based on expression kind
	switch (obj.kind) {
	case "lit":
	case "ref":
	case "var":
	case "airRef":
	case "predicate":
		return obj as Expr;

	case "call":
		return desugarCall(obj, options);

	case "if":
		return desugarIf(obj, options);

	case "let":
		return desugarLet(obj, options);

	case "record":
		return desugarRecord(obj, options);

	case "listOf":
		return desugarListOf(obj, options);

	case "match":
		return desugarMatch(obj, options);

	case "lambda":
		if (options.inferLambdaTypes && isLambdaWithoutType(obj)) {
			return transformLambdaType(obj as { kind: "lambda"; params: unknown[]; body: string });
		}
		return obj as Expr;

	case "callExpr":
		return desugarCallExpr(obj, options);

	case "fix":
	case "do":
		return obj as Expr;

		// EIR expressions - use generic desugaring
	case "seq":
	case "assign":
	case "while":
	case "for":
	case "iter":
	case "effect":
	case "refCell":
	case "deref":
	case "try":
	case "par":
	case "spawn":
	case "await":
	case "channel":
	case "send":
	case "recv":
	case "select":
	case "race":
		return desugarGeneric(obj, options);

	default:
		// Unknown kind - return as-is
		return obj as Expr;
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
 * @param doc - The document to desugar
 * @param options - Options to control which shorthands are enabled
 * @returns The desugared document
 */
export function desugarShorthands<T extends DocLike>(
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

	// Handle null, undefined, or non-object inputs
	if (doc === null || doc === undefined || typeof doc !== "object") {
		return doc;
	}

	// If document has no nodes, return as-is
	const docRecord = doc as Record<string, unknown>;
	if (!("nodes" in docRecord) || !Array.isArray(docRecord.nodes)) {
		return doc;
	}

	// Clone document to avoid mutation
	const result = { ...doc };
	const nodes = docRecord.nodes as Node[];
	(result as Record<string, unknown>).nodes = nodes.map((node) => ({
		...node,
		expr: desugarExpr(node.expr, opts),
	}));

	return result as T;
}
