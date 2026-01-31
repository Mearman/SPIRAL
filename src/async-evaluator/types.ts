// Async Evaluator - Shared Types

import type { OperatorRegistry } from "../domains/registry.js";
import type { Defs, ValueEnv } from "../env.js";
import type { EffectRegistry } from "../effects.js";
import type { AsyncIOEffectConfig } from "../async-io-effects.js";
import type {
	BlockNode,
	Value,
	EirHybridNode,
	EirExpr,
	EirBlock,
	EirInstruction,
	EirTerminator,
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
	nodeMap: Map<string, EirHybridNode>;
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
		expr: EirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	) => Promise<Value>;
	resolveNodeRef: (
		ref: string | EirExpr,
		env: ValueEnv,
		context: AsyncEvalContext,
	) => Promise<Value>;
	evalBlockNode: (
		node: BlockNode<EirBlock>,
		context: AsyncEvalContext,
	) => Promise<{ value: Value; state: AsyncEvalState }>;
	execInstruction: (
		instr: EirInstruction,
		context: AsyncEvalContext,
	) => Promise<Value>;
	execTerminator: (
		term: EirTerminator,
		blockMap: Map<string, EirBlock>,
		context: AsyncEvalContext,
	) => Promise<{ done: boolean; value?: Value; nextBlock?: string }>;
}
