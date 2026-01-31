// SPIRAL Zod Schemas
// Single source of truth for all document-serializable schemas.
// Runtime-only types (Value, ClosureVal, etc.) remain in types.ts.
//
// Type interfaces are defined manually (not via z.infer) because Zod v4's
// z.discriminatedUnion doesn't support recursion, and z.union typed as
// z.ZodType erases inferred types to `unknown`. We define the types explicitly
// and annotate recursive schemas with z.ZodType<ExplicitType>.

import { z } from "zod/v4";

//==============================================================================
// Primitives
//==============================================================================

/** Semantic version pattern */
const SemVer = z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);

/** Narrow unknown to record for z.preprocess callbacks. */
function isRecord(val: unknown): val is Record<string, unknown> {
	return val !== null && typeof val === "object" && !Array.isArray(val);
}

//==============================================================================
// Type Domain - Manual Interfaces
//==============================================================================

export interface BoolType { kind: "bool" }
export interface IntType { kind: "int" }
export interface FloatType { kind: "float" }
export interface StringType { kind: "string" }
export interface VoidType { kind: "void" }
export interface SetType { kind: "set"; of: Type }
export interface ListType { kind: "list"; of: Type }
export interface MapType { kind: "map"; key: Type; value: Type }
export interface OptionType { kind: "option"; of: Type }
export interface OpaqueType { kind: "opaque"; name: string }
export interface FnType { kind: "fn"; params: Type[]; returns: Type; optionalParams?: boolean[] | undefined }
export interface RefType { kind: "ref"; of: Type }
export interface FutureType { kind: "future"; of: Type }
export interface ChannelType { kind: "channel"; channelType: "mpsc" | "spsc" | "mpmc" | "broadcast"; of: Type }
export interface TaskType { kind: "task"; returns: Type }
export interface AsyncFnType { kind: "async"; params: Type[]; returns: FutureType }

export type Type =
	| BoolType | IntType | FloatType | StringType | VoidType
	| SetType | ListType | MapType | OptionType | OpaqueType | FnType
	| RefType | FutureType | ChannelType | TaskType | AsyncFnType;

//==============================================================================
// Expression Domain - Manual Interfaces
//==============================================================================

export interface LitExpr { kind: "lit"; type: Type; value: unknown }
export interface RefExpr { kind: "ref"; id: string }
export interface VarExpr { kind: "var"; name: string }
export interface CallExpr { kind: "call"; ns: string; name: string; args: (string | Expr)[] }
export interface IfExpr { kind: "if"; cond: string | Expr; then: string | Expr; else: string | Expr; type?: Type | undefined }
export interface LetExpr { kind: "let"; name: string; value: string | Expr; body: string | Expr }
export interface AirRefExpr { kind: "airRef"; ns: string; name: string; args: string[] }
export interface PredicateExpr { kind: "predicate"; name: string; value: string }

// CIR extensions
export interface LambdaExpr { kind: "lambda"; params: string[]; body: string; type: Type }
export interface CallFnExpr { kind: "callExpr"; fn: string; args: string[] }
export interface FixExpr { kind: "fix"; fn: string; type: Type }
export interface DoExpr { kind: "do"; exprs: (string | Expr)[] }

// EIR extensions
export interface EirSeqExpr { kind: "seq"; first: string | Expr; then: string | Expr }
export interface EirAssignExpr { kind: "assign"; target: string; value: string | Expr }
export interface EirWhileExpr { kind: "while"; cond: string | Expr; body: string | Expr }
export interface EirForExpr { kind: "for"; var: string; init: string | Expr; cond: string | Expr; update: string | Expr; body: string | Expr }
export interface EirIterExpr { kind: "iter"; var: string; iter: string | Expr; body: string | Expr }
export interface EirEffectExpr { kind: "effect"; op: string; args: (string | Expr)[] }
export interface EirRefCellExpr { kind: "refCell"; target: string }
export interface EirDerefExpr { kind: "deref"; target: string }
export interface EirTryExpr { kind: "try"; tryBody: string | Expr; catchParam: string; catchBody: string | Expr; fallback?: string | Expr | undefined }

// EIR async extensions
export interface EirParExpr { kind: "par"; branches: string[] }
export interface EirSpawnExpr { kind: "spawn"; task: string }
export interface EirAwaitExpr { kind: "await"; future: string; timeout?: string | Expr | undefined; fallback?: string | Expr | undefined; returnIndex?: boolean | undefined }
export interface EirChannelExpr { kind: "channel"; channelType: "mpsc" | "spsc" | "mpmc" | "broadcast"; bufferSize?: string | Expr | undefined }
export interface EirSendExpr { kind: "send"; channel: string; value: string | Expr }
export interface EirRecvExpr { kind: "recv"; channel: string }
export interface EirSelectExpr { kind: "select"; futures: string[]; timeout?: string | Expr | undefined; fallback?: string | Expr | undefined; returnIndex?: boolean | undefined }
export interface EirRaceExpr { kind: "race"; tasks: string[] }

export type Expr =
	| LitExpr | RefExpr | VarExpr | CallExpr | IfExpr | LetExpr
	| AirRefExpr | PredicateExpr
	| LambdaExpr | CallFnExpr | FixExpr | DoExpr;

export type EirExpr =
	| Expr
	| EirSeqExpr | EirAssignExpr | EirWhileExpr | EirForExpr | EirIterExpr
	| EirEffectExpr | EirRefCellExpr | EirDerefExpr | EirTryExpr
	| EirParExpr | EirSpawnExpr | EirAwaitExpr | EirChannelExpr
	| EirSendExpr | EirRecvExpr | EirSelectExpr | EirRaceExpr;

//==============================================================================
// LIR Domain - Manual Interfaces
//==============================================================================

export interface LirInsAssign { kind: "assign"; target: string; value: Expr }
export interface LirInsCall { kind: "call"; target: string; callee: string; args: string[] }
export interface LirInsOp { kind: "op"; target: string; ns: string; name: string; args: string[] }
export interface LirInsPhi { kind: "phi"; target: string; sources: { block: string; id: string }[] }
export interface LirInsEffect { kind: "effect"; target?: string | undefined; op: string; args: string[] }
export interface LirInsAssignRef { kind: "assignRef"; target: string; value: string }

export type LirInstruction = LirInsAssign | LirInsCall | LirInsOp | LirInsPhi | LirInsEffect | LirInsAssignRef;

export interface LirTermJump { kind: "jump"; to: string }
export interface LirTermBranch { kind: "branch"; cond: string; then: string; else: string }
export interface LirTermReturn { kind: "return"; value?: string | undefined }
export interface LirTermExit { kind: "exit"; code?: string | number | undefined }

export type LirTerminator = LirTermJump | LirTermBranch | LirTermReturn | LirTermExit;

export interface LirBlock { id: string; instructions: LirInstruction[]; terminator: LirTerminator }

//==============================================================================
// Layer-Specific Block/Instruction Types
//==============================================================================

export interface AirInsAssign { kind: "assign"; target: string; value: Expr }
export interface AirInsOp { kind: "op"; target: string; ns: string; name: string; args: string[] }
export type AirInsPhi = LirInsPhi;
export type AirInstruction = AirInsAssign | AirInsOp | AirInsPhi;

export type CirInstruction = AirInstruction;

export interface EirInsAssign { kind: "assign"; target: string; value: EirExpr }
export type EirInsEffect = LirInsEffect;
export type EirInsAssignRef = LirInsAssignRef;

// EIR async block instructions
export interface EirInsSpawn { kind: "spawn"; target: string; entry: string; args?: string[] | undefined }
export interface EirInsChannelOp { kind: "channelOp"; op: "send" | "recv" | "trySend" | "tryRecv"; target?: string | undefined; channel: string; value?: string | undefined }
export interface EirInsAwait { kind: "await"; target: string; future: string }
export type EirInstruction = EirInsAssign | AirInsOp | AirInsPhi | EirInsEffect | EirInsAssignRef | EirInsSpawn | EirInsChannelOp | EirInsAwait;

// EIR async terminators
export interface EirTermFork { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string }
export interface EirTermJoin { kind: "join"; tasks: string[]; results?: string[] | undefined; to: string }
export interface EirTermSuspend { kind: "suspend"; future: string; resumeBlock: string }
export type EirTerminator = LirTerminator | EirTermFork | EirTermJoin | EirTermSuspend;

export interface AirBlock { id: string; instructions: AirInstruction[]; terminator: LirTerminator }
export interface CirBlock { id: string; instructions: CirInstruction[]; terminator: LirTerminator }
export interface EirBlock { id: string; instructions: EirInstruction[]; terminator: EirTerminator }

//==============================================================================
// Node & Document Types
//==============================================================================

export interface Node<E = Expr> { id: string; expr: E }
export interface ExprNode<E = Expr> { id: string; type?: Type | undefined; expr: E }
export interface BlockNode<B = LirBlock> { id: string; type?: Type | undefined; blocks: B[]; entry: string }
export type HybridNode<E = Expr, B = LirBlock> = ExprNode<E> | BlockNode<B>;

export type AirHybridNode = HybridNode<Expr, AirBlock>;
export type CirHybridNode = HybridNode<Expr, CirBlock>;
export type EirHybridNode = HybridNode<EirExpr, EirBlock>;
export type LirHybridNode = HybridNode;

export type EirNode = Node<EirExpr>;

export interface LambdaParam {
	name: string;
	type?: Type | undefined;
	optional?: boolean | undefined;
	default?: Expr | undefined;
}

export interface FunctionSignature {
	ns: string;
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
}

export interface AIRDef {
	ns: string;
	name: string;
	params: string[];
	result: Type;
	body: Expr;
}

export interface AIRDocument {
	version: string;
	capabilities?: string[] | undefined;
	functionSigs?: FunctionSignature[] | undefined;
	airDefs: AIRDef[];
	nodes: AirHybridNode[];
	result: string;
}

export interface CIRDocument {
	version: string;
	capabilities?: string[] | undefined;
	functionSigs?: FunctionSignature[] | undefined;
	airDefs: AIRDef[];
	nodes: CirHybridNode[];
	result: string;
}

export interface EIRDocument {
	version: string;
	capabilities?: string[] | undefined;
	functionSigs?: FunctionSignature[] | undefined;
	airDefs?: AIRDef[] | undefined;
	nodes: EirHybridNode[];
	result: string;
}

export interface LIRDocument {
	version: string;
	capabilities?: string[] | undefined;
	functionSigs?: FunctionSignature[] | undefined;
	airDefs?: AIRDef[] | undefined;
	nodes: LirHybridNode[];
	result: string;
}

//==============================================================================
// Zod Schemas - Type Domain (16 variants)
//==============================================================================

export const BoolTypeSchema = z.object({ kind: z.literal("bool") }).meta({ id: "BoolType", title: "Boolean Type", description: "Boolean truth value type" });
export const IntTypeSchema = z.object({ kind: z.literal("int") }).meta({ id: "IntType", title: "Integer Type", description: "Arbitrary-precision integer type" });
export const FloatTypeSchema = z.object({ kind: z.literal("float") }).meta({ id: "FloatType", title: "Float Type", description: "IEEE 754 floating-point type" });
export const StringTypeSchema = z.object({ kind: z.literal("string") }).meta({ id: "StringType", title: "String Type", description: "UTF-8 string type" });
export const VoidTypeSchema = z.object({ kind: z.literal("void") }).meta({ id: "VoidType", title: "Void Type", description: "Unit type representing no value" });

export const SetTypeSchema: z.ZodType<SetType> = z.preprocess(
	(val) => {
		if (!isRecord(val) || val.kind !== "set") return val;
		if (!val.of && val.elem) { return { ...val, of: val.elem }; }
		if (!val.of && val.elementType) { return { ...val, of: val.elementType }; }
		return val;
	},
	z.object({
		kind: z.literal("set"),
		get of() { return TypeSchema; },
	}),
).meta({ id: "SetType", title: "Set Type", description: "Unordered collection of unique elements" });

export const ListTypeSchema: z.ZodType<ListType> = z.object({
	kind: z.literal("list"),
	get of() { return TypeSchema; },
}).meta({ id: "ListType", title: "List Type", description: "Ordered sequence of elements" });

export const MapTypeSchema: z.ZodType<MapType> = z.object({
	kind: z.literal("map"),
	get key() { return TypeSchema; },
	get value() { return TypeSchema; },
}).meta({ id: "MapType", title: "Map Type", description: "Key-value associative container" });

export const OptionTypeSchema: z.ZodType<OptionType> = z.object({
	kind: z.literal("option"),
	get of() { return TypeSchema; },
}).meta({ id: "OptionType", title: "Option Type", description: "Nullable wrapper type (Some or None)" });

export const OpaqueTypeSchema = z.object({
	kind: z.literal("opaque"),
	name: z.string(),
}).meta({ id: "OpaqueType", title: "Opaque Type", description: "Named opaque type whose internal structure is hidden" });

export const FnTypeSchema: z.ZodType<FnType> = z.object({
	kind: z.literal("fn"),
	get params() { return z.array(TypeSchema); },
	get returns() { return TypeSchema; },
	optionalParams: z.array(z.boolean()).optional(),
}).meta({ id: "FnType", title: "Function Type", description: "Function signature with parameter and return types" });

export const RefTypeSchema: z.ZodType<RefType> = z.object({
	kind: z.literal("ref"),
	get of() { return TypeSchema; },
}).meta({ id: "RefType", title: "Reference Type", description: "Mutable reference to a value" });

export const FutureTypeSchema: z.ZodType<FutureType> = z.object({
	kind: z.literal("future"),
	get of() { return TypeSchema; },
}).meta({ id: "FutureType", title: "Future Type", description: "Asynchronous value that resolves later" });

export const ChannelTypeSchema: z.ZodType<ChannelType> = z.object({
	kind: z.literal("channel"),
	channelType: z.enum(["mpsc", "spsc", "mpmc", "broadcast"]),
	get of() { return TypeSchema; },
}).meta({ id: "ChannelType", title: "Channel Type", description: "Typed communication channel between concurrent tasks" });

export const TaskTypeSchema: z.ZodType<TaskType> = z.object({
	kind: z.literal("task"),
	get returns() { return TypeSchema; },
}).meta({ id: "TaskType", title: "Task Type", description: "Spawnable concurrent task with a return type" });

export const AsyncFnTypeSchema: z.ZodType<AsyncFnType> = z.object({
	kind: z.literal("async"),
	get params() { return z.array(TypeSchema); },
	get returns() { return FutureTypeSchema; },
}).meta({ id: "AsyncFnType", title: "Async Function Type", description: "Asynchronous function returning a Future" });

/** Union of all 16 type variants. Uses z.union (not discriminatedUnion) due to recursion. */
export const TypeSchema: z.ZodType<Type> = z.union([
	BoolTypeSchema,
	IntTypeSchema,
	FloatTypeSchema,
	StringTypeSchema,
	VoidTypeSchema,
	SetTypeSchema,
	ListTypeSchema,
	MapTypeSchema,
	OptionTypeSchema,
	OpaqueTypeSchema,
	FnTypeSchema,
	RefTypeSchema,
	FutureTypeSchema,
	ChannelTypeSchema,
	TaskTypeSchema,
	AsyncFnTypeSchema,
]).meta({ id: "Type", title: "Type", description: "Union of all SPIRAL type annotations" });

//==============================================================================
// Zod Schemas - Expression Domain - AIR (8 variants)
//==============================================================================

/** Helper: string or recursive Expr */
const stringOrExpr = (): z.ZodType<string | Expr> => z.union([z.string(), ExprSchema]);

export const LitExprSchema: z.ZodType<LitExpr> = z.object({
	kind: z.literal("lit"),
	type: TypeSchema,
	value: z.unknown(),
}).meta({ id: "LitExpr", title: "Literal Expression", description: "Constant value with an explicit type annotation" });

export const RefExprSchema = z.object({
	kind: z.literal("ref"),
	id: z.string(),
}).meta({ id: "RefExpr", title: "Reference Expression", description: "Reference to another node by its ID" });

export const VarExprSchema = z.object({
	kind: z.literal("var"),
	name: z.string(),
}).meta({ id: "VarExpr", title: "Variable Expression", description: "Named variable reference (e.g., lambda parameter)" });

export const CallExprSchema: z.ZodType<CallExpr> = z.object({
	kind: z.literal("call"),
	ns: z.string(),
	name: z.string(),
	get args() { return z.array(stringOrExpr()); },
}).meta({ id: "CallExpr", title: "Call Expression", description: "Namespaced operator call (e.g., core:add)" });

export const IfExprSchema: z.ZodType<IfExpr> = z.object({
	kind: z.literal("if"),
	get cond() { return stringOrExpr(); },
	get then() { return stringOrExpr(); },
	get else() { return stringOrExpr(); },
	type: TypeSchema.optional(),
}).meta({ id: "IfExpr", title: "If Expression", description: "Conditional expression with then/else branches" });

export const LetExprSchema: z.ZodType<LetExpr> = z.object({
	kind: z.literal("let"),
	name: z.string(),
	get value() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
	type: TypeSchema.optional(),
}).meta({ id: "LetExpr", title: "Let Expression", description: "Local binding that scopes a name to a value within a body" });

export const AirRefExprSchema = z.object({
	kind: z.literal("airRef"),
	ns: z.string(),
	name: z.string(),
	args: z.array(z.string()),
}).meta({ id: "AirRefExpr", title: "AIR Definition Reference", description: "Call to a reusable AIR definition by namespace and name" });

export const PredicateExprSchema = z.object({
	kind: z.literal("predicate"),
	name: z.string(),
	value: z.string(),
}).meta({ id: "PredicateExpr", title: "Predicate Expression", description: "Type predicate that always returns true for its argument" });

//==============================================================================
// Zod Schemas - Expression Domain - CIR extensions (4 variants)
//==============================================================================

export const LambdaParamSchema: z.ZodType<LambdaParam> = z.object({
	name: z.string(),
	type: TypeSchema.optional(),
	optional: z.boolean().optional(),
	get default() { return ExprSchema.optional(); },
}).meta({ id: "LambdaParam", title: "Lambda Parameter", description: "Named parameter with optional type, default value, and optionality flag" });

export const LambdaExprSchema: z.ZodType<LambdaExpr> = z.object({
	kind: z.literal("lambda"),
	params: z.array(z.union([z.string(), LambdaParamSchema])),
	body: z.string(),
	type: TypeSchema,
}).meta({ id: "LambdaExpr", title: "Lambda Expression", description: "Anonymous function with parameters and a body node" }) as z.ZodType<LambdaExpr>;

export const CallFnExprSchema: z.ZodType<CallFnExpr> = z.object({
	kind: z.literal("callExpr"),
	fn: z.string(),
	get args() { return z.array(stringOrExpr()); },
}).meta({ id: "CallFnExpr", title: "Function Call Expression", description: "Invocation of a first-class function node with arguments" }) as z.ZodType<CallFnExpr>;

export const FixExprSchema: z.ZodType<FixExpr> = z.object({
	kind: z.literal("fix"),
	fn: z.string(),
	type: TypeSchema,
}).meta({ id: "FixExpr", title: "Fix-Point Combinator", description: "Y-combinator for general recursion (CIR and above)" });

export const DoExprSchema: z.ZodType<DoExpr> = z.object({
	kind: z.literal("do"),
	get exprs() { return z.array(stringOrExpr()); },
}).meta({ id: "DoExpr", title: "Do Expression", description: "Sequence of expressions returning the last value" });

//==============================================================================
// Zod Schemas - Expression Domain - EIR extensions (9 variants)
//==============================================================================

export const EirSeqExprSchema: z.ZodType<EirSeqExpr> = z.object({
	kind: z.literal("seq"),
	get first() { return stringOrExpr(); },
	get then() { return stringOrExpr(); },
}).meta({ id: "EirSeqExpr", title: "Sequence Expression", description: "Execute first, discard result, then evaluate and return second" });

export const EirAssignExprSchema: z.ZodType<EirAssignExpr> = z.object({
	kind: z.literal("assign"),
	target: z.string(),
	get value() { return stringOrExpr(); },
}).meta({ id: "EirAssignExpr", title: "Assignment Expression", description: "Assign a value to a mutable variable" });

export const EirWhileExprSchema: z.ZodType<EirWhileExpr> = z.object({
	kind: z.literal("while"),
	get cond() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
}).meta({ id: "EirWhileExpr", title: "While Loop", description: "Loop that repeats body while condition is true" });

export const EirForExprSchema: z.ZodType<EirForExpr> = z.object({
	kind: z.literal("for"),
	var: z.string(),
	get init() { return stringOrExpr(); },
	get cond() { return stringOrExpr(); },
	get update() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
}).meta({ id: "EirForExpr", title: "For Loop", description: "C-style for loop with init, condition, update, and body" });

export const EirIterExprSchema: z.ZodType<EirIterExpr> = z.object({
	kind: z.literal("iter"),
	var: z.string(),
	get iter() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
}).meta({ id: "EirIterExpr", title: "Iterator Loop", description: "For-each loop binding each element to a variable" });

export const EirEffectExprSchema: z.ZodType<EirEffectExpr> = z.object({
	kind: z.literal("effect"),
	op: z.string(),
	get args() { return z.array(stringOrExpr()); },
}).meta({ id: "EirEffectExpr", title: "Effect Expression", description: "Side-effecting operation (e.g., print, I/O)" });

export const EirRefCellExprSchema = z.object({
	kind: z.literal("refCell"),
	target: z.string(),
}).meta({ id: "EirRefCellExpr", title: "Ref Cell Expression", description: "Create a mutable reference cell wrapping a target" });

export const EirDerefExprSchema = z.object({
	kind: z.literal("deref"),
	target: z.string(),
}).meta({ id: "EirDerefExpr", title: "Dereference Expression", description: "Read the current value of a mutable reference cell" });

export const EirTryExprSchema: z.ZodType<EirTryExpr> = z.object({
	kind: z.literal("try"),
	get tryBody() { return stringOrExpr(); },
	catchParam: z.string(),
	get catchBody() { return stringOrExpr(); },
	get fallback() { return stringOrExpr().optional(); },
}).meta({ id: "EirTryExpr", title: "Try/Catch Expression", description: "Error handling with a try body and catch clause" });

//==============================================================================
// Zod Schemas - Expression Domain - EIR async extensions (8 variants)
//==============================================================================

export const EirParExprSchema = z.object({
	kind: z.literal("par"),
	branches: z.array(z.string()),
}).meta({ id: "EirParExpr", title: "Parallel Expression", description: "Execute branches concurrently and collect all results" });

export const EirSpawnExprSchema = z.object({
	kind: z.literal("spawn"),
	task: z.string(),
}).meta({ id: "EirSpawnExpr", title: "Spawn Expression", description: "Launch a concurrent task and return a future handle" });

export const EirAwaitExprSchema: z.ZodType<EirAwaitExpr> = z.object({
	kind: z.literal("await"),
	future: z.string(),
	get timeout() { return stringOrExpr().optional(); },
	get fallback() { return stringOrExpr().optional(); },
	returnIndex: z.boolean().optional(),
}).meta({ id: "EirAwaitExpr", title: "Await Expression", description: "Block until a future resolves, with optional timeout and fallback" });

export const EirChannelExprSchema: z.ZodType<EirChannelExpr> = z.object({
	kind: z.literal("channel"),
	channelType: z.enum(["mpsc", "spsc", "mpmc", "broadcast"]),
	get bufferSize() { return stringOrExpr().optional(); },
}).meta({ id: "EirChannelExpr", title: "Channel Expression", description: "Create a typed communication channel with optional buffer" });

export const EirSendExprSchema: z.ZodType<EirSendExpr> = z.object({
	kind: z.literal("send"),
	channel: z.string(),
	get value() { return stringOrExpr(); },
}).meta({ id: "EirSendExpr", title: "Send Expression", description: "Send a value into a channel" });

export const EirRecvExprSchema = z.object({
	kind: z.literal("recv"),
	channel: z.string(),
}).meta({ id: "EirRecvExpr", title: "Receive Expression", description: "Receive a value from a channel" });

export const EirSelectExprSchema: z.ZodType<EirSelectExpr> = z.object({
	kind: z.literal("select"),
	futures: z.array(z.string()),
	get timeout() { return stringOrExpr().optional(); },
	get fallback() { return stringOrExpr().optional(); },
	returnIndex: z.boolean().optional(),
}).meta({ id: "EirSelectExpr", title: "Select Expression", description: "Wait for the first of multiple futures to resolve" });

export const EirRaceExprSchema = z.object({
	kind: z.literal("race"),
	tasks: z.array(z.string()),
}).meta({ id: "EirRaceExpr", title: "Race Expression", description: "Race multiple tasks, returning the first to complete" });

//==============================================================================
// Combined Expression Schema
//==============================================================================

/** AIR-only expression variants (no CIR/EIR/async extensions). */
export const AirExprSchema: z.ZodType<Expr> = z.union([
	LitExprSchema,
	RefExprSchema,
	VarExprSchema,
	CallExprSchema,
	IfExprSchema,
	LetExprSchema,
	AirRefExprSchema,
	PredicateExprSchema,
] satisfies [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]).meta({ id: "AirExpr", title: "AIR Expression", description: "Pure, bounded expression (no recursion or side effects)" });

/** CIR-only expression variants: AIR plus lambda/callExpr/fix/do. No async extensions. */
export const CirExprSchema: z.ZodType<Expr> = z.union([
	LitExprSchema,
	RefExprSchema,
	VarExprSchema,
	CallExprSchema,
	IfExprSchema,
	LetExprSchema,
	AirRefExprSchema,
	PredicateExprSchema,
	LambdaExprSchema,
	CallFnExprSchema,
	FixExprSchema,
	DoExprSchema,
] satisfies [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]).meta({ id: "CirExpr", title: "CIR Expression", description: "Functional expression with lambdas and recursion (no side effects)" });

/**
 * Wide expression union used by the recursive stringOrExpr() helper.
 * Includes all expression kinds (AIR+CIR+EIR async) because Zod's recursive
 * schema model prevents per-layer restriction of nested inline expressions.
 * For layer-specific top-level validation, use AirExprSchema, CirExprSchema, etc.
 */
export const ExprSchema: z.ZodType<Expr> = z.union([
	LitExprSchema,
	RefExprSchema,
	VarExprSchema,
	CallExprSchema,
	IfExprSchema,
	LetExprSchema,
	AirRefExprSchema,
	PredicateExprSchema,
	LambdaExprSchema,
	CallFnExprSchema,
	FixExprSchema,
	DoExprSchema,
] satisfies [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]).meta({ id: "Expr", title: "Expression", description: "Wide expression union used for recursive inline expressions" });

/** EIR expression variants: all base expressions plus EIR imperative and async extensions. */
export const EirExprSchema: z.ZodType<EirExpr> = z.union([
	LitExprSchema,
	RefExprSchema,
	VarExprSchema,
	CallExprSchema,
	IfExprSchema,
	LetExprSchema,
	AirRefExprSchema,
	PredicateExprSchema,
	LambdaExprSchema,
	CallFnExprSchema,
	FixExprSchema,
	DoExprSchema,
	EirSeqExprSchema,
	EirAssignExprSchema,
	EirWhileExprSchema,
	EirForExprSchema,
	EirIterExprSchema,
	EirEffectExprSchema,
	EirRefCellExprSchema,
	EirDerefExprSchema,
	EirTryExprSchema,
	EirParExprSchema,
	EirSpawnExprSchema,
	EirAwaitExprSchema,
	EirChannelExprSchema,
	EirSendExprSchema,
	EirRecvExprSchema,
	EirSelectExprSchema,
	EirRaceExprSchema,
] satisfies [z.ZodType<EirExpr>, z.ZodType<EirExpr>, ...z.ZodType<EirExpr>[]]).meta({ id: "EirExpr", title: "EIR Expression", description: "Imperative expression with effects, mutation, loops, and concurrency" });

//==============================================================================
// Zod Schemas - LIR Domain
//==============================================================================

export const LirInsAssignSchema: z.ZodType<LirInsAssign> = z.object({
	kind: z.literal("assign"),
	target: z.string(),
	value: CirExprSchema,
}).meta({ id: "LirInsAssign", title: "LIR Assign Instruction", description: "Assign an expression result to a target variable" });

export const LirInsCallSchema = z.object({
	kind: z.literal("call"),
	target: z.string(),
	callee: z.string(),
	args: z.array(z.string()),
}).meta({ id: "LirInsCall", title: "LIR Call Instruction", description: "Direct function call storing result in target" });

export const LirInsOpSchema = z.object({
	kind: z.literal("op"),
	target: z.string(),
	ns: z.string(),
	name: z.string(),
	args: z.array(z.string()),
}).meta({ id: "LirInsOp", title: "LIR Operator Instruction", description: "Namespaced operator application storing result in target" });

export const LirInsPhiSchema = z.object({
	kind: z.literal("phi"),
	target: z.string(),
	sources: z.array(z.preprocess(
		(val) => {
			if (isRecord(val) && "value" in val && !("id" in val)) {
				return { ...val, id: val.value };
			}
			return val;
		},
		z.object({ block: z.string(), id: z.string() }),
	)),
}).meta({ id: "LirInsPhi", title: "LIR Phi Instruction", description: "SSA phi node selecting a value based on predecessor block" });

export const LirInsEffectSchema = z.object({
	kind: z.literal("effect"),
	target: z.string().optional(),
	op: z.string(),
	args: z.array(z.string()),
}).meta({ id: "LirInsEffect", title: "LIR Effect Instruction", description: "Side-effecting operation within a basic block" });

export const LirInsAssignRefSchema = z.object({
	kind: z.literal("assignRef"),
	target: z.string(),
	value: z.string(),
}).meta({ id: "LirInsAssignRef", title: "LIR Assign-Ref Instruction", description: "Assign a value to a mutable reference cell" });

export const LirInstructionSchema: z.ZodType<LirInstruction> = z.union([
	LirInsAssignSchema,
	LirInsCallSchema,
	LirInsOpSchema,
	LirInsPhiSchema,
	LirInsEffectSchema,
	LirInsAssignRefSchema,
]).meta({ id: "LirInstruction", title: "LIR Instruction", description: "Single instruction within a basic block" });

export const LirTermJumpSchema = z.object({
	kind: z.literal("jump"),
	to: z.string(),
}).meta({ id: "LirTermJump", title: "Jump Terminator", description: "Unconditional jump to a target block" });

export const LirTermBranchSchema = z.object({
	kind: z.literal("branch"),
	cond: z.string(),
	then: z.string(),
	else: z.string(),
}).meta({ id: "LirTermBranch", title: "Branch Terminator", description: "Conditional branch to then or else block based on a condition" });

export const LirTermReturnSchema = z.object({
	kind: z.literal("return"),
	value: z.string().optional(),
}).meta({ id: "LirTermReturn", title: "Return Terminator", description: "Return a value from the current function" });

export const LirTermExitSchema = z.object({
	kind: z.literal("exit"),
	code: z.union([z.string(), z.number()]).optional(),
}).meta({ id: "LirTermExit", title: "Exit Terminator", description: "Terminate program execution with an optional exit code" });

export const LirTerminatorSchema: z.ZodType<LirTerminator> = z.union([
	LirTermJumpSchema,
	LirTermBranchSchema,
	LirTermReturnSchema,
	LirTermExitSchema,
]).meta({ id: "LirTerminator", title: "LIR Terminator", description: "Control-flow terminator ending a basic block" });

export const LirBlockSchema: z.ZodType<LirBlock> = z.object({
	id: z.string(),
	instructions: z.array(LirInstructionSchema),
	terminator: LirTerminatorSchema,
}).meta({ id: "LirBlock", title: "Basic Block", description: "Sequence of instructions ending with a control-flow terminator" });

//==============================================================================
// Zod Schemas - Layer-Specific Block Instructions
//==============================================================================

export const AirInstructionSchema: z.ZodType<AirInstruction> = z.union([
	z.object({ kind: z.literal("assign"), target: z.string(), value: AirExprSchema }),
	z.object({ kind: z.literal("op"), target: z.string(), ns: z.string(), name: z.string(), args: z.array(z.string()) }),
	LirInsPhiSchema,
]);

export const CirInstructionSchema: z.ZodType<CirInstruction> = z.union([
	z.object({ kind: z.literal("assign"), target: z.string(), value: CirExprSchema }),
	z.object({ kind: z.literal("op"), target: z.string(), ns: z.string(), name: z.string(), args: z.array(z.string()) }),
	LirInsPhiSchema,
]);

export const EirBlockInstructionSchema = z.union([
	z.object({ kind: z.literal("assign"), target: z.string(), value: EirExprSchema }),
	z.object({ kind: z.literal("op"), target: z.string(), ns: z.string(), name: z.string(), args: z.array(z.string()) }),
	LirInsPhiSchema,
	z.object({ kind: z.literal("effect"), target: z.string(), op: z.string(), args: z.array(z.string()) }),
	z.object({ kind: z.literal("assignRef"), target: z.string(), value: z.string() }),
]);

export const AirBlockSchema: z.ZodType<AirBlock> = z.object({
	id: z.string(),
	instructions: z.array(AirInstructionSchema),
	terminator: LirTerminatorSchema,
});

export const CirBlockSchema: z.ZodType<CirBlock> = z.object({
	id: z.string(),
	instructions: z.array(CirInstructionSchema),
	terminator: LirTerminatorSchema,
});

//==============================================================================
// Zod Schemas - EIR Async Block/Instruction/Terminator
//==============================================================================

export const EirInsSpawnSchema = z.object({
	kind: z.literal("spawn"),
	target: z.string(),
	entry: z.string(),
	args: z.array(z.string()).optional(),
}).meta({ id: "EirInsSpawn", title: "EIR Spawn Instruction", description: "Spawn a concurrent task from an entry block" });

export const EirInsChannelOpSchema = z.object({
	kind: z.literal("channelOp"),
	op: z.enum(["send", "recv", "trySend", "tryRecv"]),
	target: z.string().optional(),
	channel: z.string(),
	value: z.string().optional(),
}).meta({ id: "EirInsChannelOp", title: "EIR Channel Operation", description: "Send or receive on a typed channel within a block" });

export const EirInsAwaitSchema = z.object({
	kind: z.literal("await"),
	target: z.string(),
	future: z.string(),
}).meta({ id: "EirInsAwait", title: "EIR Await Instruction", description: "Block until a future resolves, storing result in target" });

export const EirFullInstructionSchema = z.union([
	EirBlockInstructionSchema,
	EirInsSpawnSchema,
	EirInsChannelOpSchema,
	EirInsAwaitSchema,
]);

export const EirTermForkSchema = z.object({
	kind: z.literal("fork"),
	branches: z.array(z.object({ block: z.string(), taskId: z.string() })),
	continuation: z.string(),
}).meta({ id: "EirTermFork", title: "Fork Terminator", description: "Fork execution into multiple concurrent branches" });

export const EirTermJoinSchema = z.object({
	kind: z.literal("join"),
	tasks: z.array(z.string()),
	results: z.array(z.string()).optional(),
	to: z.string(),
}).meta({ id: "EirTermJoin", title: "Join Terminator", description: "Wait for all tasks to complete, then continue" });

export const EirTermSuspendSchema = z.object({
	kind: z.literal("suspend"),
	future: z.string(),
	resumeBlock: z.string(),
}).meta({ id: "EirTermSuspend", title: "Suspend Terminator", description: "Suspend until a future resolves, then resume at a block" });

export const EirTerminatorZodSchema: z.ZodType<EirTerminator> = z.union([
	LirTermJumpSchema,
	LirTermBranchSchema,
	LirTermReturnSchema,
	LirTermExitSchema,
	EirTermForkSchema,
	EirTermJoinSchema,
	EirTermSuspendSchema,
]);

export const EirBlockSchema = z.object({
	id: z.string(),
	instructions: z.array(EirFullInstructionSchema),
	terminator: EirTerminatorZodSchema,
});

//==============================================================================
// Zod Schemas - Hybrid Nodes
//==============================================================================

/** Expression-based node for AIR layer (restricted expression set) */
export const AirExprNodeSchema = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: AirExprSchema,
});

/** Expression-based node (CIR layer) */
export const ExprNodeSchema: z.ZodType<ExprNode> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: ExprSchema,
});

/** Expression-based node for EIR layer */
export const EirExprNodeSchema = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: EirExprSchema,
});

/** Block-based node (generic) */
function blockNodeSchema<B>(blockSchema: z.ZodType<B>) {
	return z.object({
		id: z.string(),
		type: TypeSchema.optional(),
		blocks: z.array(blockSchema),
		entry: z.string(),
	});
}

export const AirHybridNodeSchema = z.union([AirExprNodeSchema, blockNodeSchema(AirBlockSchema)]);
/** Expression-based node for CIR layer (no async expressions) */
export const CirExprNodeSchema = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: CirExprSchema,
});

export const CirHybridNodeSchema = z.union([CirExprNodeSchema, blockNodeSchema(CirBlockSchema)]);
export const EirHybridNodeSchema = z.union([EirExprNodeSchema, blockNodeSchema(EirBlockSchema)]);
/** Expression-based node for LIR layer (no async expressions) */
export const LirExprNodeSchema = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: CirExprSchema,
});

export const LirHybridNodeSchema = z.union([LirExprNodeSchema, blockNodeSchema(LirBlockSchema)]);

//==============================================================================
// Zod Schemas - Supporting
//==============================================================================

export const FunctionSignatureSchema: z.ZodType<FunctionSignature> = z.object({
	ns: z.string(),
	name: z.string(),
	params: z.array(TypeSchema),
	returns: TypeSchema,
	pure: z.boolean(),
}).meta({ id: "FunctionSignature", title: "Function Signature", description: "Declared function signature with purity annotation" });

export const AIRDefSchema: z.ZodType<AIRDef> = z.object({
	ns: z.string(),
	name: z.string(),
	params: z.array(z.string()),
	result: TypeSchema,
	body: AirExprSchema,
}).meta({ id: "AIRDef", title: "AIR Definition", description: "Reusable pure function definition scoped to AIR" });

//==============================================================================
// Zod Schemas - Documents
//==============================================================================

export const AIRDocumentSchema: z.ZodType<AIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema),
	nodes: z.array(AirHybridNodeSchema),
	result: z.string(),
}).meta({ id: "AIRDocument", title: "AIR Document", description: "AIRDocument" });

export const CIRDocumentSchema: z.ZodType<CIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema),
	nodes: z.array(CirHybridNodeSchema),
	result: z.string(),
}).meta({ id: "CIRDocument", title: "CIR Document", description: "CIRDocument" });

export const EIRDocumentSchema: z.ZodType<EIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema).optional(),
	nodes: z.array(EirHybridNodeSchema),
	result: z.string(),
}).meta({ id: "EIRDocument", title: "EIR Document", description: "EIRDocument" });

export const LIRDocumentSchema: z.ZodType<LIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema).optional(),
	nodes: z.array(LirHybridNodeSchema),
	result: z.string(),
}).meta({ id: "LIRDocument", title: "LIR Document", description: "LIRDocument" });

export const SPIRALDocument = z.union([
	AIRDocumentSchema,
	CIRDocumentSchema,
	EIRDocumentSchema,
	LIRDocumentSchema,
]).meta({ id: "SPIRALDocument", title: "SPIRAL Document", description: "SPIRALDocument" });

export type SPIRALDocument = z.infer<typeof SPIRALDocument>;
