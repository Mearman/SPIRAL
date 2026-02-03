// Shared types and interfaces for the evaluator subsystem

import type { OperatorRegistry } from "../domains/registry.js";
import type { Defs, ValueEnv } from "../env.js";
import type {
	AirHybridNode,
	EirHybridNode,
	EvalState,
	Value,
} from "../types.js";
import type { EffectRegistry } from "../effects.js";

//==============================================================================
// Evaluation Options
//==============================================================================

export interface EvalOptions {
	maxSteps?: number;
	trace?: boolean;
}

export interface EIROptions extends EvalOptions {
	effects?: EffectRegistry;
}

//==============================================================================
// Evaluator State
//==============================================================================

export interface EvalContext {
	steps: number;
	maxSteps: number;
	trace: boolean;
}

//==============================================================================
// Result types
//==============================================================================

export interface NodeEvalResult {
	value: Value;
	env: ValueEnv;
}

export interface EIRNodeEvalResult {
	value: Value;
	env: ValueEnv;
	refCells?: Map<string, Value>;
}

//==============================================================================
// Context objects (consolidate repeated params)
//==============================================================================

/** Context for AIR/CIR program-level evaluation. */
export interface AirEvalCtx {
	registry: OperatorRegistry;
	defs: Defs;
	nodeMap: Map<string, AirHybridNode>;
	nodeValues: Map<string, Value>;
	options?: EvalOptions | undefined;
	/** Document $defs for JSON Pointer deduplication */
	docDefs?: Record<string, unknown> | undefined;
}

/** Context for EIR program-level evaluation. */
export interface EirEvalCtx {
	registry: OperatorRegistry;
	defs: Defs;
	effectRegistry: EffectRegistry;
	nodeMap: Map<string, EirHybridNode>;
	nodeValues: Map<string, Value>;
	state: EvalState;
	options?: EIROptions | undefined;
}
