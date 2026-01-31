// SPIRAL PIR (Parallel IR) Runtime Types
// Extracted from types.ts to reduce file size

import type { ValueEnv } from "./env.js";
import type {
	Expr, Type, PirExpr,
	FutureType, ChannelType, TaskType, AsyncFnType,
	PirParExpr, PirSpawnExpr, PirAwaitExpr,
} from "./zod-schemas.js";
import type { Value, EvalState, ErrorVal } from "./types.js";

//==============================================================================
// PIR Value Domain — kept as manual interfaces (runtime only)
//==============================================================================

export interface FutureVal {
	kind: "future";
	taskId: string;
	status: "pending" | "ready" | "error";
	value?: Value;
}

export interface ChannelVal {
	kind: "channel";
	id: string;
	channelType: "mpsc" | "spsc" | "mpmc" | "broadcast";
}

export interface TaskVal {
	kind: "task";
	id: string;
	returnType: Type;
}

export interface SelectResultVal {
	kind: "selectResult";
	index: number; // -1=timeout, 0..n-1=winning future
	value: Value;
}

//==============================================================================
// Async Evaluation State — kept as manual interfaces (runtime only)
//==============================================================================

export interface AsyncEvalState extends EvalState {
	taskId: string;
	scheduler: TaskScheduler;
	channels: unknown; // AsyncChannelStore (use unknown to avoid circular dependency)
	taskPool: Map<string, TaskState>;
	parentTaskId?: string;
}

export interface TaskState {
	expr: PirExpr;
	env: ValueEnv;
	status: "running" | "completed" | "failed";
	result?: Value;
	error?: ErrorVal;
}

//==============================================================================
// PIR Value Constructors
//==============================================================================

export const futureVal = (
	taskId: string,
	status: "pending" | "ready" | "error" = "pending",
	value?: Value,
): FutureVal => {
	const result: FutureVal = { kind: "future", taskId, status };
	if (value !== undefined) result.value = value;
	return result;
};

export const channelVal = (
	id: string,
	channelType: "mpsc" | "spsc" | "mpmc" | "broadcast",
): ChannelVal => ({ kind: "channel", id, channelType });

export const taskVal = (id: string, returnType: Type): TaskVal => ({
	kind: "task",
	id,
	returnType,
});

//==============================================================================
// PIR Type Constructors
//==============================================================================

export const futureType = (of: Type): FutureType => ({ kind: "future", of });

export const channelTypeCtor = (
	chanType: "mpsc" | "spsc" | "mpmc" | "broadcast",
	of: Type,
): ChannelType => ({ kind: "channel", channelType: chanType, of });

export const taskType = (returns: Type): TaskType => ({ kind: "task", returns });

export const asyncFnType = (params: Type[], returns: Type): AsyncFnType => ({
	kind: "async",
	params,
	returns: futureType(returns),
});

//==============================================================================
// Async Runtime Types — kept as manual interfaces (runtime only)
//==============================================================================

/**
 * TaskScheduler interface - cooperative task scheduling
 * Implemented in src/scheduler.ts
 */
export interface TaskScheduler {
	spawn(taskId: string, fn: () => Promise<Value>): void;
	await(taskId: string): Promise<Value>;
	currentTaskId: string;
	checkGlobalSteps(): Promise<void>;
}

/**
 * AsyncChannel interface - Go-style buffered channels
 * Implemented in src/async-effects.ts
 */
export interface AsyncChannel {
	send(value: Value): Promise<void>;
	recv(): Promise<Value>;
	close(): void;
}

//==============================================================================
// Type Guards for PIR Types
//==============================================================================

export function isFuture(v: Value): v is FutureVal {
	return v.kind === "future";
}

export function isChannel(v: Value): v is ChannelVal {
	return v.kind === "channel";
}

export function isTask(v: Value): v is TaskVal {
	return v.kind === "task";
}

export function isPirParExpr(expr: Expr): expr is PirParExpr {
	return expr.kind === "par";
}

export function isPirSpawnExpr(expr: Expr): expr is PirSpawnExpr {
	return expr.kind === "spawn";
}

export function isPirAwaitExpr(expr: Expr): expr is PirAwaitExpr {
	return expr.kind === "await";
}
