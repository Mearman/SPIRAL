// Async Evaluator - Shared Types

import type { OperatorRegistry } from "../domains/registry.js";
import type { Defs, ValueEnv } from "../env.js";
import type { EffectRegistry } from "../effects.js";
import type { AsyncIOEffectConfig } from "../async-io-effects.js";
import type {
	BlockNode,
	Value,
	PirHybridNode,
	PirExpr,
	PirBlock,
	PirInstruction,
	PirTerminator,
	AsyncEvalState,
} from "../types.js";
import type { TaskScheduler } from "../scheduler.js";

//==============================================================================
// Async Evaluation Options
//==============================================================================

export interface AsyncEvalOptions {
	maxSteps?: number;
	trace?: boolean;
	concurrency?: "sequential" | "parallel" | "speculative";
	scheduler?: TaskScheduler;
}

//==============================================================================
// Async Evaluation Context (includes evaluator services)
//==============================================================================

export interface AsyncEvalContext {
	steps: number;
	maxSteps: number;
	trace: boolean;
	concurrency: "sequential" | "parallel" | "speculative";
	state: AsyncEvalState;
	nodeMap: Map<string, PirHybridNode>;
	nodeValues: Map<string, Value>;
	readonly svc: EvalServices;
}

//==============================================================================
// Evaluator Services (injected dependencies from the class)
//==============================================================================

export interface EvalServices {
	readonly registry: OperatorRegistry;
	readonly defs: Defs;
	readonly effectRegistry: EffectRegistry;
	readonly asyncIOConfig: AsyncIOEffectConfig | undefined;
	evalExpr: (
		expr: PirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	) => Promise<Value>;
	resolveNodeRef: (
		ref: string | PirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	) => Promise<Value>;
	evalBlockNode: (
		node: BlockNode<PirBlock>,
		context: AsyncEvalContext,
	) => Promise<{ value: Value; state: AsyncEvalState }>;
	execInstruction: (
		instr: PirInstruction,
		context: AsyncEvalContext,
	) => Promise<Value>;
	execTerminator: (
		term: PirTerminator,
		blockMap: Map<string, PirBlock>,
		context: AsyncEvalContext,
	) => Promise<{ done: boolean; value?: Value; nextBlock?: string }>;
}
