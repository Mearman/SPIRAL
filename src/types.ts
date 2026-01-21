// CAIRS Type Definitions
// Implements Value, Type, and Expression AST domains

//==============================================================================
// Error Codes
//==============================================================================

export const ErrorCodes = {
	TypeError: "TypeError",
	ArityError: "ArityError",
	DomainError: "DomainError",
	DivideByZero: "DivideByZero",
	UnknownOperator: "UnknownOperator",
	UnknownDefinition: "UnknownDefinition",
	UnboundIdentifier: "UnboundIdentifier",
	NonTermination: "NonTermination",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

//==============================================================================
// Type Domain (Γ - static types)
//==============================================================================

export type Type =
	| BoolType
	| IntType
	| FloatType
	| StringType
	| SetType
	| ListType
	| MapType
	| OptionType
	| OpaqueType
	| FnType; // CIR only

export interface BoolType {
	kind: "bool";
}

export interface IntType {
	kind: "int";
}

export interface FloatType {
	kind: "float";
}

export interface StringType {
	kind: "string";
}

export interface SetType {
	kind: "set";
	of: Type;
}

export interface ListType {
	kind: "list";
	of: Type;
}

export interface MapType {
	kind: "map";
	key: Type;
	value: Type;
}

export interface OptionType {
	kind: "option";
	of: Type;
}

export interface OpaqueType {
	kind: "opaque";
	name: string;
}

export interface FnType {
	kind: "fn";
	params: Type[];
	returns: Type;
}

//==============================================================================
// Value Domain (v - runtime values)
//==============================================================================

export type Value =
	| BoolVal
	| IntVal
	| FloatVal
	| StringVal
	| ListVal
	| SetVal
	| MapVal
	| OptionVal
	| OpaqueVal
	| ClosureVal // CIR only
	| ErrorVal; // Err(code, message?, meta?)

export interface BoolVal {
	kind: "bool";
	value: boolean;
}

export interface IntVal {
	kind: "int";
	value: number;
}

export interface FloatVal {
	kind: "float";
	value: number;
}

export interface StringVal {
	kind: "string";
	value: string;
}

export interface ListVal {
	kind: "list";
	value: Value[];
}

export interface SetVal {
	kind: "set";
	value: Set<string>;
}

export interface MapVal {
	kind: "map";
	value: Map<string, Value>;
}

export interface OptionVal {
	kind: "option";
	value: Value | null;
}

export interface OpaqueVal {
	kind: "opaque";
	name: string;
	value: unknown;
}

export interface ClosureVal {
	kind: "closure";
	params: string[];
	body: Expr;
	env: ValueEnv;
}

export interface ErrorVal {
	kind: "error";
	code: string;
	message?: string;
	meta?: Map<string, Value>;
}

//==============================================================================
// Expression AST (e - syntactic expressions)
//==============================================================================

export type Expr =
	| LitExpr
	| RefExpr
	| VarExpr
	| CallExpr
	| IfExpr
	| LetExpr
	| AirRefExpr
	| PredicateExpr
	| LambdaExpr // CIR only
	| CallFnExpr // CIR only (distinguished from operator Call)
	| FixExpr; // CIR only

export interface LitExpr {
	kind: "lit";
	type: Type;
	value: unknown;
}

export interface RefExpr {
	kind: "ref";
	id: string;
}

export interface VarExpr {
	kind: "var";
	name: string;
}

export interface CallExpr {
	kind: "call";
	ns: string;
	name: string;
	args: string[];
}

export interface IfExpr {
	kind: "if";
	cond: string;
	then: string;
	else: string;
	type: Type;
}

export interface LetExpr {
	kind: "let";
	name: string;
	value: string;
	body: string;
}

export interface AirRefExpr {
	kind: "airRef";
	ns: string;
	name: string;
	args: string[];
}

export interface PredicateExpr {
	kind: "predicate";
	name: string;
	value: string;
}

export interface LambdaExpr {
	kind: "lambda";
	params: string[];
	body: string;
	type: Type;
}

export interface CallFnExpr {
	kind: "callExpr";
	fn: string;
	args: string[];
}

export interface FixExpr {
	kind: "fix";
	fn: string;
	type: Type;
}

//==============================================================================
// AIR Definition (airDef)
//==============================================================================

export interface AIRDef {
	ns: string;
	name: string;
	params: string[];
	result: Type;
	body: Expr;
}

//==============================================================================
// Document Structure
//==============================================================================

export interface FunctionSignature {
	ns: string;
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
}

export interface Node {
	id: string;
	expr: Expr;
}

export interface AIRDocument {
	version: string;
	capabilities?: string[];
	functionSigs?: FunctionSignature[];
	airDefs: AIRDef[];
	nodes: Node[];
	result: string;
}

export interface CIRDocument extends AIRDocument {
	// CIR extends AIR - additional capabilities are implicit
	// in the presence of lambda, callExpr, fix nodes
}

//==============================================================================
// Related Types
//==============================================================================

import type { ValueEnv } from "./env.js";

//==============================================================================
// Value Hashing for Set/Map keys
//==============================================================================

export function hashValue(v: Value): string {
	switch (v.kind) {
		case "bool":
			return "b:" + String(v.value);
		case "int":
			return "i:" + String(v.value);
		case "float":
			return "f:" + String(v.value);
		case "string":
			return "s:" + v.value;
		case "option":
			return v.value === null ? "o:none" : "o:some:" + hashValue(v.value);
		default:
			// Complex types use object identity
			return "ref:" + Math.random().toString(36).slice(2);
	}
}

//==============================================================================
// Type Guards
//==============================================================================

export function isError(v: Value): v is ErrorVal {
	return v.kind === "error";
}

export function isClosure(v: Value): v is ClosureVal {
	return v.kind === "closure";
}

export function isPrimitiveType(t: Type): boolean {
	return (
		t.kind === "bool" ||
		t.kind === "int" ||
		t.kind === "float" ||
		t.kind === "string"
	);
}

//==============================================================================
// Type Equality
//==============================================================================

export function typeEqual(a: Type, b: Type): boolean {
	if (a.kind !== b.kind) return false;

	switch (a.kind) {
		case "bool":
		case "int":
		case "float":
		case "string":
			return true;
		case "set":
		case "list":
		case "option":
			return typeEqual(a.of, (b as SetType | ListType | OptionType).of);
		case "map":
			return (
				typeEqual(a.key, (b as MapType).key) &&
				typeEqual(a.value, (b as MapType).value)
			);
		case "opaque":
			return a.name === (b as OpaqueType).name;
		case "fn": {
			const fnB = b as FnType;
			if (a.params.length !== fnB.params.length) return false;
			if (!a.params.every((p, i) => typeEqual(p, fnB.params[i]!))) {
				return false;
			}
			return typeEqual(a.returns, fnB.returns);
		}
	}
}

//==============================================================================
// Value Constructors
//==============================================================================

export const boolVal = (value: boolean): BoolVal => ({ kind: "bool", value });
export const intVal = (value: number): IntVal => ({ kind: "int", value });
export const floatVal = (value: number): FloatVal => ({ kind: "float", value });
export const stringVal = (value: string): StringVal => ({
	kind: "string",
	value,
});
export const listVal = (value: Value[]): ListVal => ({ kind: "list", value });
export const setVal = (value: Set<string>): SetVal => ({ kind: "set", value });
export const mapVal = (value: Map<string, Value>): MapVal => ({
	kind: "map",
	value,
});
export const optionVal = (value: Value | null): OptionVal => ({
	kind: "option",
	value,
});
export const opaqueVal = (name: string, value: unknown): OpaqueVal => ({
	kind: "opaque",
	name,
	value,
});
export const closureVal = (
	params: string[],
	body: Expr,
	env: ValueEnv,
): ClosureVal => ({ kind: "closure", params, body, env });
export const errorVal = (
	code: string,
	message?: string,
	meta?: Map<string, Value>,
): ErrorVal => {
	const result: ErrorVal = { kind: "error", code };
	if (message !== undefined) result.message = message;
	if (meta !== undefined) result.meta = meta;
	return result;
};

//==============================================================================
// Type Constructors
//==============================================================================

export const boolType: BoolType = { kind: "bool" };
export const intType: IntType = { kind: "int" };
export const floatType: FloatType = { kind: "float" };
export const stringType: StringType = { kind: "string" };
export const setType = (of: Type): SetType => ({ kind: "set", of });
export const listType = (of: Type): ListType => ({ kind: "list", of });
export const mapType = (key: Type, value: Type): MapType => ({
	kind: "map",
	key,
	value,
});
export const optionType = (of: Type): OptionType => ({ kind: "option", of });
export const opaqueType = (name: string): OpaqueType => ({
	kind: "opaque",
	name,
});
export const fnType = (params: Type[], returns: Type): FnType => ({
	kind: "fn",
	params,
	returns,
});
