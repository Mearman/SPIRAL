/* eslint-disable max-lines, @typescript-eslint/consistent-type-assertions */
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

/** PIR version pattern (must be 2.x.x) */
const PirVersion = z.string().regex(/^2\.\d+\.\d+$/);

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
export interface IfExpr { kind: "if"; cond: string; then: string; else: string; type: Type }
export interface LetExpr { kind: "let"; name: string; value: string; body: string }
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

// PIR extensions
export interface PirParExpr { kind: "par"; branches: string[] }
export interface PirSpawnExpr { kind: "spawn"; task: string }
export interface PirAwaitExpr { kind: "await"; future: string; timeout?: string | Expr | undefined; fallback?: string | Expr | undefined; returnIndex?: boolean | undefined }
export interface PirChannelExpr { kind: "channel"; channelType: "mpsc" | "spsc" | "mpmc" | "broadcast"; bufferSize?: string | Expr | undefined }
export interface PirSendExpr { kind: "send"; channel: string; value: string | Expr }
export interface PirRecvExpr { kind: "recv"; channel: string }
export interface PirSelectExpr { kind: "select"; futures: string[]; timeout?: string | Expr | undefined; fallback?: string | Expr | undefined; returnIndex?: boolean | undefined }
export interface PirRaceExpr { kind: "race"; tasks: string[] }

export type Expr =
	| LitExpr | RefExpr | VarExpr | CallExpr | IfExpr | LetExpr
	| AirRefExpr | PredicateExpr
	| LambdaExpr | CallFnExpr | FixExpr | DoExpr
	| PirParExpr | PirSpawnExpr | PirAwaitExpr | PirChannelExpr
	| PirSendExpr | PirRecvExpr | PirSelectExpr | PirRaceExpr;

export type EirExpr = Expr | EirSeqExpr | EirAssignExpr | EirWhileExpr | EirForExpr | EirIterExpr | EirEffectExpr | EirRefCellExpr | EirDerefExpr | EirTryExpr;

export type PirExpr =
	| EirExpr
	| PirParExpr | PirSpawnExpr | PirAwaitExpr | PirChannelExpr
	| PirSendExpr | PirRecvExpr | PirSelectExpr | PirRaceExpr;

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

export type EirInsEffect = LirInsEffect;
export type EirInsAssignRef = LirInsAssignRef;
export type EirInstruction = CirInstruction | EirInsEffect | EirInsAssignRef;

export interface AirBlock { id: string; instructions: AirInstruction[]; terminator: LirTerminator }
export interface CirBlock { id: string; instructions: CirInstruction[]; terminator: LirTerminator }
export interface EirBlock { id: string; instructions: EirInstruction[]; terminator: LirTerminator }

//==============================================================================
// PIR Block/Instruction/Terminator Types
//==============================================================================

export interface PirInsSpawn { kind: "spawn"; target: string; entry: string; args?: string[] | undefined }
export interface PirInsChannelOp { kind: "channelOp"; op: "send" | "recv" | "trySend" | "tryRecv"; target?: string | undefined; channel: string; value?: string | undefined }
export interface PirInsAwait { kind: "await"; target: string; future: string }
export type PirInstruction = EirInstruction | PirInsSpawn | PirInsChannelOp | PirInsAwait;

export interface PirTermFork { kind: "fork"; branches: { block: string; taskId: string }[]; continuation: string }
export interface PirTermJoin { kind: "join"; tasks: string[]; results?: string[] | undefined; to: string }
export interface PirTermSuspend { kind: "suspend"; future: string; resumeBlock: string }
export type PirTerminator = LirTerminator | PirTermFork | PirTermJoin | PirTermSuspend;

export interface PirBlock { id: string; instructions: PirInstruction[]; terminator: PirTerminator }

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
export type PirHybridNode = HybridNode<PirExpr, PirBlock>;

export type EirNode = Node<EirExpr>;
export type PirNode = Node<PirExpr>;

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
	airDefs: AIRDef[];
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

export interface PIRDocument {
	version: string;
	capabilities?: string[] | undefined;
	functionSigs?: FunctionSignature[] | undefined;
	airDefs?: AIRDef[] | undefined;
	nodes: PirHybridNode[];
	result: string;
}

//==============================================================================
// Zod Schemas - Type Domain (16 variants)
//==============================================================================

export const BoolTypeSchema = z.object({ kind: z.literal("bool") });
export const IntTypeSchema = z.object({ kind: z.literal("int") });
export const FloatTypeSchema = z.object({ kind: z.literal("float") });
export const StringTypeSchema = z.object({ kind: z.literal("string") });
export const VoidTypeSchema = z.object({ kind: z.literal("void") });

export const SetTypeSchema: z.ZodType<SetType> = z.preprocess(
	(val) => {
		if (val && typeof val === "object" && "kind" in val && (val as Record<string, unknown>).kind === "set") {
			const obj = val as Record<string, unknown>;
			if (!obj.of && obj.elem) { return { ...obj, of: obj.elem }; }
			if (!obj.of && obj.elementType) { return { ...obj, of: obj.elementType }; }
		}
		return val;
	},
	z.object({
		kind: z.literal("set"),
		get of() { return TypeSchema; },
	}),
) as z.ZodType<SetType>;

export const ListTypeSchema: z.ZodType<ListType> = z.object({
	kind: z.literal("list"),
	get of() { return TypeSchema; },
});

export const MapTypeSchema: z.ZodType<MapType> = z.object({
	kind: z.literal("map"),
	get key() { return TypeSchema; },
	get value() { return TypeSchema; },
});

export const OptionTypeSchema: z.ZodType<OptionType> = z.object({
	kind: z.literal("option"),
	get of() { return TypeSchema; },
});

export const OpaqueTypeSchema = z.object({
	kind: z.literal("opaque"),
	name: z.string(),
});

export const FnTypeSchema: z.ZodType<FnType> = z.object({
	kind: z.literal("fn"),
	get params() { return z.array(TypeSchema); },
	get returns() { return TypeSchema; },
	optionalParams: z.array(z.boolean()).optional(),
});

export const RefTypeSchema: z.ZodType<RefType> = z.object({
	kind: z.literal("ref"),
	get of() { return TypeSchema; },
});

export const FutureTypeSchema: z.ZodType<FutureType> = z.object({
	kind: z.literal("future"),
	get of() { return TypeSchema; },
});

export const ChannelTypeSchema: z.ZodType<ChannelType> = z.object({
	kind: z.literal("channel"),
	channelType: z.enum(["mpsc", "spsc", "mpmc", "broadcast"]),
	get of() { return TypeSchema; },
});

export const TaskTypeSchema: z.ZodType<TaskType> = z.object({
	kind: z.literal("task"),
	get returns() { return TypeSchema; },
});

export const AsyncFnTypeSchema: z.ZodType<AsyncFnType> = z.object({
	kind: z.literal("async"),
	get params() { return z.array(TypeSchema); },
	get returns() { return FutureTypeSchema; },
});

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
]);

//==============================================================================
// Zod Schemas - Expression Domain - AIR (8 variants)
//==============================================================================

/** Helper: string or recursive Expr */
const stringOrExpr = (): z.ZodType<string | Expr> => z.union([z.string(), ExprSchema]);

export const LitExprSchema: z.ZodType<LitExpr> = z.object({
	kind: z.literal("lit"),
	type: TypeSchema,
	value: z.unknown(),
});

export const RefExprSchema = z.object({
	kind: z.literal("ref"),
	id: z.string(),
});

export const VarExprSchema = z.object({
	kind: z.literal("var"),
	name: z.string(),
});

export const CallExprSchema: z.ZodType<CallExpr> = z.object({
	kind: z.literal("call"),
	ns: z.string(),
	name: z.string(),
	get args() { return z.array(stringOrExpr()); },
});

export const IfExprSchema: z.ZodType<IfExpr> = z.object({
	kind: z.literal("if"),
	get cond() { return stringOrExpr(); },
	get then() { return stringOrExpr(); },
	get else() { return stringOrExpr(); },
	type: TypeSchema.optional(),
}) as z.ZodType<IfExpr>;

export const LetExprSchema: z.ZodType<LetExpr> = z.object({
	kind: z.literal("let"),
	name: z.string(),
	get value() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
	type: TypeSchema.optional(),
}) as z.ZodType<LetExpr>;

export const AirRefExprSchema = z.object({
	kind: z.literal("airRef"),
	ns: z.string(),
	name: z.string(),
	args: z.array(z.string()),
});

export const PredicateExprSchema = z.object({
	kind: z.literal("predicate"),
	name: z.string(),
	value: z.string(),
});

//==============================================================================
// Zod Schemas - Expression Domain - CIR extensions (4 variants)
//==============================================================================

export const LambdaParamSchema: z.ZodType<LambdaParam> = z.object({
	name: z.string(),
	type: TypeSchema.optional(),
	optional: z.boolean().optional(),
	get default() { return ExprSchema.optional(); },
});

export const LambdaExprSchema: z.ZodType<LambdaExpr> = z.object({
	kind: z.literal("lambda"),
	params: z.array(z.union([z.string(), LambdaParamSchema])),
	body: z.string(),
	type: TypeSchema,
}) as z.ZodType<LambdaExpr>;

export const CallFnExprSchema: z.ZodType<CallFnExpr> = z.object({
	kind: z.literal("callExpr"),
	fn: z.string(),
	get args() { return z.array(stringOrExpr()); },
}) as z.ZodType<CallFnExpr>;

export const FixExprSchema: z.ZodType<FixExpr> = z.object({
	kind: z.literal("fix"),
	fn: z.string(),
	type: TypeSchema,
});

export const DoExprSchema: z.ZodType<DoExpr> = z.object({
	kind: z.literal("do"),
	get exprs() { return z.array(stringOrExpr()); },
});

//==============================================================================
// Zod Schemas - Expression Domain - EIR extensions (9 variants)
//==============================================================================

export const EirSeqExprSchema: z.ZodType<EirSeqExpr> = z.object({
	kind: z.literal("seq"),
	get first() { return stringOrExpr(); },
	get then() { return stringOrExpr(); },
});

export const EirAssignExprSchema: z.ZodType<EirAssignExpr> = z.object({
	kind: z.literal("assign"),
	target: z.string(),
	get value() { return stringOrExpr(); },
});

export const EirWhileExprSchema: z.ZodType<EirWhileExpr> = z.object({
	kind: z.literal("while"),
	get cond() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
});

export const EirForExprSchema: z.ZodType<EirForExpr> = z.object({
	kind: z.literal("for"),
	var: z.string(),
	get init() { return stringOrExpr(); },
	get cond() { return stringOrExpr(); },
	get update() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
});

export const EirIterExprSchema: z.ZodType<EirIterExpr> = z.object({
	kind: z.literal("iter"),
	var: z.string(),
	get iter() { return stringOrExpr(); },
	get body() { return stringOrExpr(); },
});

export const EirEffectExprSchema: z.ZodType<EirEffectExpr> = z.object({
	kind: z.literal("effect"),
	op: z.string(),
	get args() { return z.array(stringOrExpr()); },
});

export const EirRefCellExprSchema = z.object({
	kind: z.literal("refCell"),
	target: z.string(),
});

export const EirDerefExprSchema = z.object({
	kind: z.literal("deref"),
	target: z.string(),
});

export const EirTryExprSchema: z.ZodType<EirTryExpr> = z.object({
	kind: z.literal("try"),
	get tryBody() { return stringOrExpr(); },
	catchParam: z.string(),
	get catchBody() { return stringOrExpr(); },
	get fallback() { return stringOrExpr().optional(); },
});

//==============================================================================
// Zod Schemas - Expression Domain - PIR extensions (8 variants)
//==============================================================================

export const PirParExprSchema = z.object({
	kind: z.literal("par"),
	branches: z.array(z.string()),
});

export const PirSpawnExprSchema = z.object({
	kind: z.literal("spawn"),
	task: z.string(),
});

export const PirAwaitExprSchema: z.ZodType<PirAwaitExpr> = z.object({
	kind: z.literal("await"),
	future: z.string(),
	get timeout() { return stringOrExpr().optional(); },
	get fallback() { return stringOrExpr().optional(); },
	returnIndex: z.boolean().optional(),
});

export const PirChannelExprSchema: z.ZodType<PirChannelExpr> = z.object({
	kind: z.literal("channel"),
	channelType: z.enum(["mpsc", "spsc", "mpmc", "broadcast"]),
	get bufferSize() { return stringOrExpr().optional(); },
});

export const PirSendExprSchema: z.ZodType<PirSendExpr> = z.object({
	kind: z.literal("send"),
	channel: z.string(),
	get value() { return stringOrExpr(); },
});

export const PirRecvExprSchema = z.object({
	kind: z.literal("recv"),
	channel: z.string(),
});

export const PirSelectExprSchema: z.ZodType<PirSelectExpr> = z.object({
	kind: z.literal("select"),
	futures: z.array(z.string()),
	get timeout() { return stringOrExpr().optional(); },
	get fallback() { return stringOrExpr().optional(); },
	returnIndex: z.boolean().optional(),
});

export const PirRaceExprSchema = z.object({
	kind: z.literal("race"),
	tasks: z.array(z.string()),
});

//==============================================================================
// Combined Expression Schema
//==============================================================================

/** AIR-only expression variants (no CIR/EIR/PIR extensions). */
export const AirExprSchema: z.ZodType<Expr> = z.union([
	LitExprSchema,
	RefExprSchema,
	VarExprSchema,
	CallExprSchema,
	IfExprSchema,
	LetExprSchema,
	AirRefExprSchema,
	PredicateExprSchema,
] as [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]);

/** CIR-only expression variants: AIR plus lambda/callExpr/fix/do. No PIR extensions. */
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
] as [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]);

/**
 * Wide expression union used by the recursive stringOrExpr() helper.
 * Includes all expression kinds (AIR+CIR+PIR) because Zod's recursive
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
	PirParExprSchema,
	PirSpawnExprSchema,
	PirAwaitExprSchema,
	PirChannelExprSchema,
	PirSendExprSchema,
	PirRecvExprSchema,
	PirSelectExprSchema,
	PirRaceExprSchema,
] as [z.ZodType<Expr>, z.ZodType<Expr>, ...z.ZodType<Expr>[]]);

/** EIR expression variants: all base expressions plus EIR-specific ones. */
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
] as [z.ZodType<EirExpr>, z.ZodType<EirExpr>, ...z.ZodType<EirExpr>[]]);

/** PIR expression variants: all EIR expressions plus PIR-specific ones. */
export const PirExprSchema: z.ZodType<PirExpr> = z.union([
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
	PirParExprSchema,
	PirSpawnExprSchema,
	PirAwaitExprSchema,
	PirChannelExprSchema,
	PirSendExprSchema,
	PirRecvExprSchema,
	PirSelectExprSchema,
	PirRaceExprSchema,
] as [z.ZodType<PirExpr>, z.ZodType<PirExpr>, ...z.ZodType<PirExpr>[]]);

//==============================================================================
// Zod Schemas - LIR Domain
//==============================================================================

export const LirInsAssignSchema: z.ZodType<LirInsAssign> = z.object({
	kind: z.literal("assign"),
	target: z.string(),
	value: CirExprSchema,
});

export const LirInsCallSchema = z.object({
	kind: z.literal("call"),
	target: z.string(),
	callee: z.string(),
	args: z.array(z.string()),
});

export const LirInsOpSchema = z.object({
	kind: z.literal("op"),
	target: z.string(),
	ns: z.string(),
	name: z.string(),
	args: z.array(z.string()),
});

export const LirInsPhiSchema = z.object({
	kind: z.literal("phi"),
	target: z.string(),
	sources: z.array(z.preprocess(
		(val) => {
			if (val && typeof val === "object" && "value" in val && !("id" in val)) {
				const obj = val as Record<string, unknown>;
				return { ...obj, id: obj.value };
			}
			return val;
		},
		z.object({ block: z.string(), id: z.string() }),
	)),
});

export const LirInsEffectSchema = z.object({
	kind: z.literal("effect"),
	target: z.string().optional(),
	op: z.string(),
	args: z.array(z.string()),
});

export const LirInsAssignRefSchema = z.object({
	kind: z.literal("assignRef"),
	target: z.string(),
	value: z.string(),
});

export const LirInstructionSchema: z.ZodType<LirInstruction> = z.union([
	LirInsAssignSchema,
	LirInsCallSchema,
	LirInsOpSchema,
	LirInsPhiSchema,
	LirInsEffectSchema,
	LirInsAssignRefSchema,
]);

export const LirTermJumpSchema = z.object({
	kind: z.literal("jump"),
	to: z.string(),
});

export const LirTermBranchSchema = z.object({
	kind: z.literal("branch"),
	cond: z.string(),
	then: z.string(),
	else: z.string(),
});

export const LirTermReturnSchema = z.object({
	kind: z.literal("return"),
	value: z.string().optional(),
});

export const LirTermExitSchema = z.object({
	kind: z.literal("exit"),
	code: z.union([z.string(), z.number()]).optional(),
});

export const LirTerminatorSchema: z.ZodType<LirTerminator> = z.union([
	LirTermJumpSchema,
	LirTermBranchSchema,
	LirTermReturnSchema,
	LirTermExitSchema,
]);

export const LirBlockSchema: z.ZodType<LirBlock> = z.object({
	id: z.string(),
	instructions: z.array(LirInstructionSchema),
	get terminator() { return PirTerminatorSchema; },
}) as z.ZodType<LirBlock>;

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

export const EirBlockInstructionSchema: z.ZodType<EirInstruction> = z.union([
	z.object({ kind: z.literal("assign"), target: z.string(), value: EirExprSchema }),
	z.object({ kind: z.literal("op"), target: z.string(), ns: z.string(), name: z.string(), args: z.array(z.string()) }),
	LirInsPhiSchema,
	z.object({ kind: z.literal("effect"), target: z.string(), op: z.string(), args: z.array(z.string()) }),
	z.object({ kind: z.literal("assignRef"), target: z.string(), value: z.string() }),
]) as z.ZodType<EirInstruction>;

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

export const EirBlockSchema: z.ZodType<EirBlock> = z.object({
	id: z.string(),
	instructions: z.array(EirBlockInstructionSchema),
	terminator: LirTerminatorSchema,
});

//==============================================================================
// Zod Schemas - PIR Block/Instruction/Terminator
//==============================================================================

export const PirInsSpawnSchema = z.object({
	kind: z.literal("spawn"),
	target: z.string(),
	entry: z.string(),
	args: z.array(z.string()).optional(),
});

export const PirInsChannelOpSchema = z.object({
	kind: z.literal("channelOp"),
	op: z.enum(["send", "recv", "trySend", "tryRecv"]),
	target: z.string().optional(),
	channel: z.string(),
	value: z.string().optional(),
});

export const PirInsAwaitSchema = z.object({
	kind: z.literal("await"),
	target: z.string(),
	future: z.string(),
});

export const PirInstructionSchema: z.ZodType<PirInstruction> = z.union([
	EirBlockInstructionSchema,
	PirInsSpawnSchema,
	PirInsChannelOpSchema,
	PirInsAwaitSchema,
]);

export const PirTermForkSchema = z.object({
	kind: z.literal("fork"),
	branches: z.array(z.object({ block: z.string(), taskId: z.string() })),
	continuation: z.string(),
});

export const PirTermJoinSchema = z.object({
	kind: z.literal("join"),
	tasks: z.array(z.string()),
	results: z.array(z.string()).optional(),
	to: z.string(),
});

export const PirTermSuspendSchema = z.object({
	kind: z.literal("suspend"),
	future: z.string(),
	resumeBlock: z.string(),
});

export const PirTerminatorSchema: z.ZodType<PirTerminator> = z.union([
	LirTermJumpSchema,
	LirTermBranchSchema,
	LirTermReturnSchema,
	LirTermExitSchema,
	PirTermForkSchema,
	PirTermJoinSchema,
	PirTermSuspendSchema,
]);

export const PirBlockSchema: z.ZodType<PirBlock> = z.object({
	id: z.string(),
	instructions: z.array(PirInstructionSchema),
	terminator: PirTerminatorSchema,
});

//==============================================================================
// Zod Schemas - Hybrid Nodes
//==============================================================================

/** Expression-based node for AIR layer (restricted expression set) */
export const AirExprNodeSchema: z.ZodType<ExprNode> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: AirExprSchema,
}) as z.ZodType<ExprNode>;

/** Expression-based node (CIR layer) */
export const ExprNodeSchema: z.ZodType<ExprNode> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: ExprSchema,
});

/** Expression-based node for EIR layer */
export const EirExprNodeSchema: z.ZodType<ExprNode<EirExpr>> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: EirExprSchema,
}) as z.ZodType<ExprNode<EirExpr>>;

/** Expression-based node for PIR layer */
export const PirExprNodeSchema: z.ZodType<ExprNode<PirExpr>> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: PirExprSchema,
}) as z.ZodType<ExprNode<PirExpr>>;

/** Block-based node (generic) */
function blockNodeSchema<B>(blockSchema: z.ZodType<B>): z.ZodType<BlockNode<B>> {
	return z.object({
		id: z.string(),
		type: TypeSchema.optional(),
		blocks: z.array(blockSchema),
		entry: z.string(),
	}) as z.ZodType<BlockNode<B>>;
}

export const AirHybridNodeSchema: z.ZodType<AirHybridNode> = z.union([AirExprNodeSchema, blockNodeSchema(AirBlockSchema)]) as z.ZodType<AirHybridNode>;
/** Expression-based node for CIR layer (no PIR expressions) */
export const CirExprNodeSchema: z.ZodType<ExprNode> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: CirExprSchema,
}) as z.ZodType<ExprNode>;

export const CirHybridNodeSchema: z.ZodType<CirHybridNode> = z.union([CirExprNodeSchema, blockNodeSchema(CirBlockSchema)]) as z.ZodType<CirHybridNode>;
export const EirHybridNodeSchema: z.ZodType<EirHybridNode> = z.union([EirExprNodeSchema, blockNodeSchema(EirBlockSchema)]) as z.ZodType<EirHybridNode>;
/** Expression-based node for LIR layer (no PIR expressions) */
export const LirExprNodeSchema: z.ZodType<ExprNode> = z.object({
	id: z.string(),
	type: TypeSchema.optional(),
	expr: CirExprSchema,
}) as z.ZodType<ExprNode>;

export const LirHybridNodeSchema: z.ZodType<LirHybridNode> = z.union([LirExprNodeSchema, blockNodeSchema(LirBlockSchema)]) as z.ZodType<LirHybridNode>;
export const PirHybridNodeSchema: z.ZodType<PirHybridNode> = z.union([PirExprNodeSchema, blockNodeSchema(PirBlockSchema)]) as z.ZodType<PirHybridNode>;

//==============================================================================
// Zod Schemas - Supporting
//==============================================================================

export const FunctionSignatureSchema: z.ZodType<FunctionSignature> = z.object({
	ns: z.string(),
	name: z.string(),
	params: z.array(TypeSchema),
	returns: TypeSchema,
	pure: z.boolean(),
});

export const AIRDefSchema: z.ZodType<AIRDef> = z.object({
	ns: z.string(),
	name: z.string(),
	params: z.array(z.string()),
	result: TypeSchema,
	body: AirExprSchema,
});

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
}).describe("AIRDocument");

export const CIRDocumentSchema: z.ZodType<CIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema),
	nodes: z.array(CirHybridNodeSchema),
	result: z.string(),
}).describe("CIRDocument");

export const EIRDocumentSchema: z.ZodType<EIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema),
	nodes: z.array(EirHybridNodeSchema),
	result: z.string(),
}).describe("EIRDocument");

export const LIRDocumentSchema: z.ZodType<LIRDocument> = z.object({
	version: SemVer,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema).optional(),
	nodes: z.array(LirHybridNodeSchema),
	result: z.string(),
}).describe("LIRDocument");

export const PIRDocumentSchema: z.ZodType<PIRDocument> = z.object({
	version: PirVersion,
	capabilities: z.array(z.string()).optional(),
	functionSigs: z.array(FunctionSignatureSchema).optional(),
	airDefs: z.array(AIRDefSchema).optional(),
	nodes: z.array(PirHybridNodeSchema),
	result: z.string(),
}).describe("PIRDocument");
