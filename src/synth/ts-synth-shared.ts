// Shared types, constants, and formatting utilities for TypeScript synthesis

import type { Expr, Node, EirNode, Value, AIRDef } from "../types.ts";

//==============================================================================
// Options and Types
//==============================================================================

export interface TypeScriptSynthOptions {
	/** Module name for generated code (used in comments) */
	moduleName?: string | undefined;
	/** Optional header comment to prepend */
	header?: string | undefined;
}

export interface ExprSynthState {
	lines: string[];
	varIndex: number;
	airDefs: Map<string, AIRDef>;
	nodeMap: Map<string, Node | EirNode>;
	inlinedNodes: Set<string>;
}

export interface SynthContext {
	state: ExprSynthState;
	mutableCells: Map<string, boolean>;
	cellInitLines: string[];
	paramScope: Set<string>;
}

//==============================================================================
// Operator Mappings
//==============================================================================

interface OperatorMapping {
	tsOp: string;
	customImpl?: (args: string[]) => string;
}

export const OPERATOR_MAP: Record<string, OperatorMapping> = {
	"core:add": { tsOp: "+" },
	"core:sub": { tsOp: "-" },
	"core:mul": { tsOp: "*" },
	"core:div": { tsOp: "/", customImpl: (args) => `Math.floor(${args[0]} / ${args[1]})` },
	"core:mod": { tsOp: "%" },
	"core:pow": { tsOp: "**" },
	"core:neg": { tsOp: "-", customImpl: (args) => `(-${args[0]})` },
	"core:eq": { tsOp: "===" },
	"core:neq": { tsOp: "!==" },
	"core:lt": { tsOp: "<" },
	"core:lte": { tsOp: "<=" },
	"core:gt": { tsOp: ">" },
	"core:gte": { tsOp: ">=" },
	"bool:and": { tsOp: "&&" },
	"bool:or": { tsOp: "||" },
	"bool:not": { tsOp: "!", customImpl: (args) => `(!${args[0]})` },
	"list:length": { tsOp: "length", customImpl: (args) => `(${args[0]}).length` },
	"list:concat": { tsOp: "+", customImpl: (args) => `[...${args[0]}, ...${args[1]}]` },
	"string:concat": { tsOp: "+", customImpl: (args) => `(${args[0]} + ${args[1]})` },
};

//==============================================================================
// Small utilities
//==============================================================================

export function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function stableVarName(nodeId: string): string {
	const sanitized = sanitizeId(nodeId);
	const base = sanitized.startsWith("v_") ? sanitized.slice(2) : sanitized;
	return `v_${base}`;
}

export function freshVar(state: ExprSynthState): string {
	return `_v${state.varIndex++}`;
}

/** Type guard: checks if an unknown value has a 'kind' property consistent with Value */
export function isValue(value: object): value is Value {
	return "kind" in value;
}

//==============================================================================
// Formatting
//==============================================================================

export function formatUnknownValue(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return `"${value}"`;
	if (Array.isArray(value)) return `[${value.map(formatUnknownValue).join(", ")}]`;
	if (typeof value === "object" && isValue(value)) {
		return formatLiteral(value);
	}
	return JSON.stringify(value);
}

function formatOptionValue(value: Value & { kind: "option" }): string {
	return value.value === null ? "null" : formatLiteral(value.value);
}

function formatLiteralPrimitive(value: Value): string | undefined {
	switch (value.kind) {
	case "void": return "null";
	case "option": return formatOptionValue(value);
	case "bool": return value.value ? "true" : "false";
	case "string": return `"${value.value}"`;
	case "int": return String(value.value);
	case "float": return String(value.value);
	case "opaque": return `"<opaque:${value.name}>"`;
	case "error": return `"<error:${value.code}>"`;
	default: return undefined;
	}
}

function formatLiteralCollection(value: Value): string | undefined {
	if (value.kind === "set") {
		const arr = Array.from(value.value);
		return `new Set([${arr.map((s) => JSON.stringify(s)).join(", ")}])`;
	}
	if (value.kind === "list") {
		return `[${value.value.map(formatLiteral).join(", ")}]`;
	}
	if (value.kind === "map") {
		const entries = Array.from(value.value.entries());
		return `new Map([${entries.map(([k, v]) => `[${JSON.stringify(k)}, ${formatLiteral(v)}]`).join(", ")}])`;
	}
	return undefined;
}

export function formatLiteral(value: Value): string {
	if (Array.isArray(value)) return `[${value.map(formatLiteral).join(", ")}]`;
	return formatLiteralPrimitive(value) ?? formatLiteralCollection(value) ?? `"<unknown:${value.kind}>"`;
}

//==============================================================================
// tsExpr (for AIR def bodies)
//==============================================================================

function tsExprCall(expr: Expr & { kind: "call" }): string {
	const qualName = `${expr.ns}:${expr.name}`;
	const mapping = OPERATOR_MAP[qualName];
	if (!mapping) return "null";
	const argCodes = expr.args.map((arg) =>
		typeof arg === "string" ? stableVarName(arg) : tsExpr(arg),
	);
	if (mapping.customImpl) return mapping.customImpl(argCodes);
	if (argCodes.length === 1) return `${mapping.tsOp}${argCodes[0]}`;
	if (argCodes.length === 2) return `(${argCodes[0]} ${mapping.tsOp} ${argCodes[1]})`;
	return "null";
}

export function tsExpr(expr: Expr): string {
	switch (expr.kind) {
	case "ref":
		return stableVarName(expr.id);
	case "var":
		return expr.name;
	case "lit": {
		const litValue = expr.value;
		if (typeof litValue === "object" && litValue !== null && isValue(litValue)) {
			return formatLiteral(litValue);
		}
		return formatUnknownValue(litValue);
	}
	case "call":
		return tsExprCall(expr);
	default:
		return "null";
	}
}
