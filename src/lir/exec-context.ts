// Shared execution context types for the LIR evaluator

import type { EffectRegistry } from "../effects.ts";
import type { ValueEnv, Defs } from "../env.ts";
import type { OperatorRegistry } from "../domains/registry.ts";
import type { Value, LIRDocument } from "../types.ts";

export interface LIREvalOptions {
	maxSteps?: number;
	trace?: boolean;
	effects?: EffectRegistry;
}

export interface LIRRuntimeState {
	vars: ValueEnv;
	returnValue?: Value;
	effects: { op: string; args: Value[] }[];
	steps: number;
	maxSteps: number;
	predecessor?: string;
}

export interface ExecContext {
	state: LIRRuntimeState;
	registry: OperatorRegistry;
	effectRegistry: EffectRegistry;
}

export interface EvalLIRParams {
	doc: LIRDocument;
	registry: OperatorRegistry;
	effectRegistry: EffectRegistry;
	inputs?: ValueEnv;
	options?: LIREvalOptions;
	defs?: Defs;
}

export interface EvalLIRResult {
	result: Value;
	state: LIRRuntimeState;
}
