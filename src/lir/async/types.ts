// SPIRAL LIR Async Evaluator - Shared Types

import type { ValueEnv } from "../../env.ts";
import type { EffectRegistry } from "../../effects.ts";
import type { OperatorRegistry } from "../../domains/registry.ts";
import type { LirBlock, LirHybridNode, Value } from "../../types.ts";
import type { TaskScheduler } from "../../scheduler.ts";
import type { AsyncChannelStore } from "../../async-effects.ts";

//==============================================================================
// LIR Async Evaluation Options
//==============================================================================

export interface LIRAsyncEvalOptions {
	maxSteps?: number;
	trace?: boolean;
	concurrency?: "sequential" | "parallel" | "speculative";
	effects?: EffectRegistry;
	scheduler?: TaskScheduler;
}

//==============================================================================
// LIR Async Runtime State
//==============================================================================

export interface LIRAsyncRuntimeState {
	vars: ValueEnv;
	returnValue?: Value;
	effects: { op: string; args: Value[] }[];
	steps: number;
	maxSteps: number;
	predecessor?: string;
	taskId: string;
	scheduler: TaskScheduler;
	channels: AsyncChannelStore;
	refCells: Map<string, { kind: "refCell"; value: Value }>;
}

//==============================================================================
// Context Objects (parameter object pattern to reduce param count)
//==============================================================================

export interface InstructionContext {
	state: LIRAsyncRuntimeState;
	registry: OperatorRegistry;
	effectRegistry: EffectRegistry;
}

export interface TerminatorContext {
	state: LIRAsyncRuntimeState;
	blocks: LirBlock[];
	nodeMap: Map<string, LirHybridNode>;
	registry?: OperatorRegistry;
	effectRegistry?: EffectRegistry;
}

export interface ForkContext {
	state: LIRAsyncRuntimeState;
	blocks: LirBlock[];
	nodeMap: Map<string, LirHybridNode>;
	registry: OperatorRegistry;
	effectRegistry: EffectRegistry;
}
