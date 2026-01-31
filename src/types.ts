// SPIRAL Type Definitions
// Document-serializable types are re-exported from zod-schemas.ts (single source of truth).
// Runtime-only types (Value, ClosureVal, EvalState, etc.) remain here as manual interfaces.

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
// Type Domain (re-exported from Zod schemas)
//==============================================================================

export type {
	Type,
	BoolType, IntType, FloatType, StringType, VoidType,
	SetType, ListType, MapType, OptionType, OpaqueType, FnType,
	RefType, FutureType, ChannelType, TaskType, AsyncFnType,
} from "./zod-schemas.js";

//==============================================================================
// Expression Domain (re-exported from Zod schemas)
//==============================================================================

export type {
	Expr,
	LitExpr, RefExpr, VarExpr, CallExpr, IfExpr, LetExpr,
	AirRefExpr, PredicateExpr,
	LambdaExpr, CallFnExpr, FixExpr, DoExpr,
	EirSeqExpr, EirAssignExpr, EirWhileExpr, EirForExpr, EirIterExpr,
	EirEffectExpr, EirRefCellExpr, EirDerefExpr, EirTryExpr,
	PirParExpr, PirSpawnExpr, PirAwaitExpr, PirChannelExpr,
	PirSendExpr, PirRecvExpr, PirSelectExpr, PirRaceExpr,
	EirExpr, PirExpr,
} from "./zod-schemas.js";

//==============================================================================
// AIR Definition (re-exported from Zod schemas)
//==============================================================================

export type { AIRDef, FunctionSignature, LambdaParam } from "./zod-schemas.js";

//==============================================================================
// Node & Document Types (re-exported from Zod schemas)
//==============================================================================

export type {
	Node, ExprNode, BlockNode, HybridNode,
	AirHybridNode, CirHybridNode, EirHybridNode, LirHybridNode, PirHybridNode,
	EirNode, PirNode,
	AIRDocument, CIRDocument, EIRDocument, LIRDocument, PIRDocument,
} from "./zod-schemas.js";

//==============================================================================
// LIR Types (re-exported from Zod schemas)
//==============================================================================

export type {
	LirInstruction, LirInsAssign, LirInsCall, LirInsOp, LirInsPhi, LirInsEffect, LirInsAssignRef,
	LirTerminator, LirTermJump, LirTermBranch, LirTermReturn, LirTermExit,
	LirBlock,
} from "./zod-schemas.js";

//==============================================================================
// Layer-Specific Block/Instruction Types (re-exported from Zod schemas)
//==============================================================================

export type {
	AirInstruction, AirInsAssign, AirInsOp, AirInsPhi,
	CirInstruction,
	EirInstruction, EirInsEffect, EirInsAssignRef,
	AirBlock, CirBlock, EirBlock,
} from "./zod-schemas.js";

//==============================================================================
// PIR Block/Instruction/Terminator Types (re-exported from Zod schemas)
//==============================================================================

export type {
	PirInstruction, PirInsSpawn, PirInsChannelOp, PirInsAwait,
	PirBlock,
	PirTerminator, PirTermFork, PirTermJoin, PirTermSuspend,
} from "./zod-schemas.js";

//==============================================================================
// Value Domain (v - runtime values) — kept as manual interfaces
// These contain non-JSON-serializable types (Set, Map, ValueEnv)
//==============================================================================

import type { ValueEnv } from "./env.js";
import type {
	Expr, Type, LambdaParam,
	BoolType, IntType, FloatType, StringType,
	SetType, ListType, MapType, OptionType, OpaqueType, FnType,
	VoidType, RefType,
	HybridNode, BlockNode, ExprNode,
} from "./zod-schemas.js";

import type {
	FutureVal, ChannelVal, TaskVal, SelectResultVal,
} from "./pir-types.js";

// Forward declarations for EIR values (must be before Value union)
export interface VoidVal {
	kind: "void";
}

export interface RefCellVal {
	kind: "refCell";
	value: Value;
}

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
	| VoidVal // EIR void value
	| RefCellVal // EIR reference cell value
	| ErrorVal // Err(code, message?, meta?)
	| FutureVal // PIR future value
	| ChannelVal // PIR channel value
	| TaskVal // PIR task value
	| SelectResultVal; // PIR select/await result with index

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

/**
 * Closure value with optional parameters support
 */
export interface ClosureVal {
	kind: "closure";
	params: LambdaParam[]; // All parameters are LambdaParam
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
// EIR Evaluation State and Effects — kept as manual interfaces (runtime only)
//==============================================================================

/**
 * Effect represents a side effect operation in EIR
 */
export interface Effect {
	op: string;
	args: Value[];
}

/**
 * Evaluation state for EIR programs
 * EIR requires mutable state for sequencing, loops, and effects
 */
export interface EvalState {
	env: ValueEnv;
	refCells: Map<string, Value>;
	effects: Effect[];
	steps: number;
	maxSteps: number;
}

/**
 * Create an empty evaluation state
 */
export function emptyEvalState(): EvalState {
	return {
		env: new Map(),
		refCells: new Map(),
		effects: [],
		steps: 0,
		maxSteps: 10000,
	};
}

/**
 * Create an evaluation state with initial values
 */
export function createEvalState(
	env?: ValueEnv,
	refCells?: Map<string, Value>,
	maxSteps?: number,
): EvalState {
	return {
		env: env ?? new Map<string, Value>(),
		refCells: refCells ?? new Map<string, Value>(),
		effects: [],
		steps: 0,
		maxSteps: maxSteps ?? 10000,
	};
}

//==============================================================================
// Type Guards for Hybrid Nodes
//==============================================================================

/** Check if a node is block-based (has blocks and entry) */
export function isBlockNode<E, B>(node: HybridNode<E, B>): node is BlockNode<B> {
	return "blocks" in node && "entry" in node && Array.isArray(node.blocks);
}

/** Check if a node is expression-based (has expr) */
export function isExprNode<E, B>(node: HybridNode<E, B>): node is ExprNode<E> {
	return "expr" in node && !("blocks" in node);
}

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

export function isRefCell(v: Value): v is RefCellVal {
	return v.kind === "refCell";
}

export function isVoid(v: Value): v is VoidVal {
	return v.kind === "void";
}

export function isPrimitiveType(t: Type): boolean {
	return (
		t.kind === "bool" ||
		t.kind === "int" ||
		t.kind === "float" ||
		t.kind === "string" ||
		t.kind === "void"
	);
}

export { typeEqual } from "./type-equality.js";

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
	params: LambdaParam[],
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

// EIR value constructors
export const voidVal = (): VoidVal => ({ kind: "void" });
export const refCellVal = (value: Value): RefCellVal => ({
	kind: "refCell",
	value,
});

// Undefined value for optional parameters without defaults
// Uses Option<T> with null to represent undefined
export const undefinedVal = (): OptionVal => optionVal(null);

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

// EIR type constructors
export const voidType: VoidType = { kind: "void" };
export const refType = (of: Type): RefType => ({ kind: "ref", of });

//==============================================================================
// PIR Types (re-exported from pir-types.ts)
//==============================================================================

export type {
	FutureVal, ChannelVal, TaskVal, SelectResultVal,
	AsyncEvalState, TaskState,
	TaskScheduler, AsyncChannel,
} from "./pir-types.js";

export {
	futureVal, channelVal, taskVal,
	futureType, channelTypeCtor, taskType, asyncFnType,
	isFuture, isChannel, isTask,
	isPirParExpr, isPirSpawnExpr, isPirAwaitExpr,
} from "./pir-types.js";
