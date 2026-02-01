// SPIRAL Async Evaluator
// Promise-based big-step evaluation for async: p, s |- e => v, s'
// Extends EIR with async primitives (par, spawn, await, channels)

import type { OperatorRegistry } from "../domains/registry.js";
import {
	type Defs,
	type ValueEnv,
	emptyValueEnv,
	emptyDefs,
} from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type BlockNode,
	isBlockNode,
	type Value,
	voidVal,
	errorVal,
	isError,
	type EIRDocument,
	type EirHybridNode,
	type EirExpr,
	type EirBlock,
} from "../types.js";
import { emptyEffectRegistry, type EffectRegistry } from "../effects.js";
import type { AsyncIOEffectConfig } from "../async-io-effects.js";
import type { EirInstruction, EirTerminator } from "../types.js";
import { createTaskScheduler } from "../scheduler.js";
import { createAsyncChannelStore } from "../async-effects.js";

import type { AsyncEvalContext, AsyncEvalOptions, EvalServices } from "./types.js";

// Handler modules
import * as asyncHandlers from "./async-handlers.js";
import * as eir from "./eir-handlers.js";
import * as cfg from "./cfg-handlers.js";
import { resolveNodeRef } from "./node-resolution.js";

export type { AsyncEvalOptions, AsyncEvalContext };

//==============================================================================
// Constructor Config
//==============================================================================

export interface AsyncEvalConstructorConfig {
	registry: OperatorRegistry;
	defs: Defs;
	effectRegistry?: EffectRegistry;
	asyncIOConfig?: AsyncIOEffectConfig;
}

function isConstructorConfig(
	v: OperatorRegistry | AsyncEvalConstructorConfig,
): v is AsyncEvalConstructorConfig {
	return "registry" in v && "defs" in v;
}

//==============================================================================
// Expression kind sets for dispatch
//==============================================================================

const ASYNC_KINDS: ReadonlySet<string> = new Set([
	"par", "spawn", "await", "channel", "send", "recv", "select", "race",
]);

const EIR_SYNC_KINDS: ReadonlySet<string> = new Set([
	"lit", "var", "lambda", "refCell", "ref",
]);

//==============================================================================
// EIR async dispatch helpers (split to keep complexity under 10)
//==============================================================================

function evalEirCoreExpr(
	expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext,
): Promise<Value> | Value | null {
	switch (expr.kind) {
	case "call": return eir.evalCall(expr, env, ctx);
	case "if": return eir.evalIf(expr, env, ctx);
	case "let": return eir.evalLet(expr, env, ctx);
	case "callExpr": return eir.evalCallExpr(expr, env, ctx);
	case "fix": return eir.evalFix(expr, env, ctx);
	case "seq": return eir.evalSeq(expr, env, ctx);
	}
	return null;
}

function evalEirControlExpr(
	expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext,
): Promise<Value> | Value | null {
	switch (expr.kind) {
	case "assign": return eir.evalAssignExpr(expr, env, ctx);
	case "while": return eir.evalWhile(expr, env, ctx);
	case "for": return eir.evalFor(expr, env, ctx);
	case "iter": return eir.evalIter(expr, env, ctx);
	case "effect": return eir.evalEffect(expr, env, ctx);
	case "try": return eir.evalTryExpr(expr, env, ctx);
	}
	return null;
}

//==============================================================================
// Async Evaluator Class
//==============================================================================

export class AsyncEvaluator {
	private readonly _registry: OperatorRegistry;
	private readonly _defs: Defs;
	private readonly _effectRegistry: EffectRegistry;
	private readonly _asyncIOConfig: AsyncIOEffectConfig | undefined;
	private readonly _svc: EvalServices;

	constructor(config: AsyncEvalConstructorConfig);
	constructor(registry: OperatorRegistry, defs: Defs, effectRegistry?: EffectRegistry);
	constructor(
		registryOrConfig: OperatorRegistry | AsyncEvalConstructorConfig,
		defs?: Defs,
		effectRegistry?: EffectRegistry,
	) {
		if (isConstructorConfig(registryOrConfig)) {
			this._registry = registryOrConfig.registry;
			this._defs = registryOrConfig.defs;
			this._effectRegistry = registryOrConfig.effectRegistry ?? emptyEffectRegistry();
			this._asyncIOConfig = registryOrConfig.asyncIOConfig;
		} else {
			this._registry = registryOrConfig;
			this._defs = defs ?? emptyDefs();
			this._effectRegistry = effectRegistry ?? emptyEffectRegistry();
			this._asyncIOConfig = undefined;
		}

		this._svc = this.buildServices();
	}

	get registry(): OperatorRegistry { return this._registry; }
	get defs(): Defs { return this._defs; }
	get effectRegistry(): EffectRegistry { return this._effectRegistry; }

	async evaluateDocument(doc: EIRDocument, options?: AsyncEvalOptions): Promise<Value> {
		const ctx = this.buildContext(options);
		this.buildNodeMap(doc, ctx);
		return this.evalDocumentNodes(doc, ctx);
	}

	async evaluate(
		expr: EirExpr,
		env: ValueEnv = emptyValueEnv(),
		options?: AsyncEvalOptions,
	): Promise<Value> {
		const ctx = this.buildContext(options, env);
		return this.evalExpr(expr, env, ctx);
	}

	// ==========================================================================
	// Service construction
	// ==========================================================================

	private buildServices(): EvalServices {
		return {
			registry: this._registry,
			defs: this._defs,
			effectRegistry: this._effectRegistry,
			asyncIOConfig: this._asyncIOConfig,
			evalExpr: (expr, env, ctx) => this.evalExpr(expr, env, ctx),
			resolveNodeRef: (ref, env, ctx) => resolveNodeRef(ref, env, ctx),
			evalBlockNode: (node, ctx) => this.evalBlockNode(node, ctx),
			execInstruction: (instr, ctx) => this.execInstruction(instr, ctx),
			execTerminator: (term, blockMap, ctx) => this.execTerminator(term, blockMap, ctx),
		};
	}

	// ==========================================================================
	// Context and Document Helpers
	// ==========================================================================

	private buildContext(options?: AsyncEvalOptions, env: ValueEnv = emptyValueEnv()): AsyncEvalContext {
		const maxSteps = options?.maxSteps ?? 1_000_000;
		const scheduler = options?.scheduler ?? createTaskScheduler({ globalMaxSteps: maxSteps });
		return {
			steps: 0,
			maxSteps,
			trace: options?.trace ?? false,
			concurrency: options?.concurrency ?? "sequential",
			state: {
				env, refCells: new Map(), effects: [],
				steps: 0, maxSteps, taskId: "main",
				scheduler, channels: createAsyncChannelStore(), taskPool: new Map(),
			},
			nodeMap: new Map(),
			nodeValues: new Map(),
			svc: this._svc,
		};
	}

	private buildNodeMap(doc: EIRDocument, ctx: AsyncEvalContext): void {
		for (const node of doc.nodes) ctx.nodeMap.set(node.id, node);
	}

	private async evalDocumentNodes(doc: EIRDocument, ctx: AsyncEvalContext): Promise<Value> {
		const exprNodes: EirHybridNode[] = [];
		const blockNodes: EirHybridNode[] = [];
		for (const node of doc.nodes) {
			(isBlockNode(node) ? blockNodes : exprNodes).push(node);
		}
		await this.evalNodeList(exprNodes, ctx);
		await this.evalNodeList(blockNodes, ctx);
		return ctx.nodeValues.get(doc.result)
			?? errorVal(ErrorCodes.DomainError, `Result node not found: ${doc.result}`);
	}

	private async evalNodeList(nodes: EirHybridNode[], ctx: AsyncEvalContext): Promise<void> {
		for (const node of nodes) {
			if (ctx.nodeValues.has(node.id)) continue;
			const result = await this.evalNode(node, ctx);
			ctx.nodeValues.set(node.id, result.value);
			ctx.state = result.state;
		}
	}

	// ==========================================================================
	// Node Evaluation
	// ==========================================================================

	private async evalNode(
		node: EirHybridNode,
		ctx: AsyncEvalContext,
	): Promise<{ value: Value; state: import("../types.js").AsyncEvalState }> {
		if (isBlockNode(node)) return this.evalBlockNode(node, ctx);
		const value = await this.evalExpr(node.expr, ctx.state.env, ctx);
		return { value, state: ctx.state };
	}

	private async evalBlockNode(
		node: BlockNode<EirBlock>,
		ctx: AsyncEvalContext,
	): Promise<{ value: Value; state: import("../types.js").AsyncEvalState }> {
		const blockMap = new Map<string, EirBlock>();
		for (const block of node.blocks) blockMap.set(block.id, block);
		return this.runBlockLoop(blockMap, node.entry, ctx);
	}

	private async runBlockLoop(
		blockMap: Map<string, EirBlock>,
		entryId: string,
		ctx: AsyncEvalContext,
	): Promise<{ value: Value; state: import("../types.js").AsyncEvalState }> {
		let currentBlockId = entryId;
		for (let i = 0; i < 10_000; i++) {
			const stepResult = await this.runBlockStep(blockMap, currentBlockId, ctx);
			if (stepResult.done) return { value: stepResult.value ?? voidVal(), state: ctx.state };
			currentBlockId = stepResult.nextBlock ?? "";
		}
		return { value: errorVal(ErrorCodes.DomainError, "Block execution exceeded maximum iterations"), state: ctx.state };
	}

	private async runBlockStep(
		blockMap: Map<string, EirBlock>,
		blockId: string,
		ctx: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		const block = blockMap.get(blockId);
		if (!block) return { done: true, value: errorVal(ErrorCodes.DomainError, `Block not found: ${blockId}`) };
		const instrErr = await this.runBlockInstructions(block, ctx);
		if (instrErr) return { done: true, value: instrErr };
		return this.execTerminator(block.terminator, blockMap, ctx);
	}

	private async runBlockInstructions(block: EirBlock, ctx: AsyncEvalContext): Promise<Value | null> {
		for (const instr of block.instructions) {
			const result = await this.execInstruction(instr, ctx);
			if (isError(result)) return result;
		}
		return null;
	}

	// ==========================================================================
	// Expression Dispatch
	// ==========================================================================

	async evalExpr(expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext): Promise<Value> {
		await ctx.state.scheduler.checkGlobalSteps();
		if (ASYNC_KINDS.has(expr.kind)) return this.evalAsyncExpr(expr, env, ctx);
		if (EIR_SYNC_KINDS.has(expr.kind)) return this.evalEirSyncExpr(expr, env, ctx);
		return this.evalEirAsyncExpr(expr, env, ctx);
	}

	private async evalAsyncExpr(expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext): Promise<Value> {
		switch (expr.kind) {
		case "par": return asyncHandlers.evalPar(expr, env, ctx);
		case "spawn": return asyncHandlers.evalSpawnExpr(expr, env, ctx);
		case "await": return asyncHandlers.evalAwaitExpr(expr, env, ctx);
		case "channel": return asyncHandlers.evalChannelExpr(expr, env, ctx);
		case "send": return asyncHandlers.evalSendExpr(expr, env, ctx);
		case "recv": return asyncHandlers.evalRecvExpr(expr, env, ctx);
		case "select": return asyncHandlers.evalSelectExpr(expr, env, ctx);
		case "race": return asyncHandlers.evalRaceExpr(expr, env, ctx);
		}
		return errorVal(ErrorCodes.UnknownOperator, `Unknown expression kind: ${expr.kind}`);
	}

	private evalEirSyncExpr(expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext): Value {
		switch (expr.kind) {
		case "lit": return eir.evalLit(expr);
		case "var": return eir.evalVar(expr, env, ctx);
		case "lambda": return eir.evalLambda(expr, env);
		case "refCell": return eir.evalRefCellExpr(expr, ctx);
		case "ref": return eir.evalRefExpr(expr, env, ctx);
		}
		return errorVal(ErrorCodes.UnknownOperator, `Unknown expression kind: ${expr.kind}`);
	}

	private evalEirAsyncExpr(expr: EirExpr, env: ValueEnv, ctx: AsyncEvalContext): Promise<Value> | Value {
		return evalEirCoreExpr(expr, env, ctx)
			?? evalEirControlExpr(expr, env, ctx)
			?? errorVal(ErrorCodes.UnknownOperator, `Unknown expression kind: ${expr.kind}`);
	}

	// ==========================================================================
	// Instruction & Terminator Dispatch
	// ==========================================================================

	private async execInstruction(instr: EirInstruction, ctx: AsyncEvalContext): Promise<Value> {
		switch (instr.kind) {
		case "assign": return cfg.execAssign(instr, ctx);
		case "op": return cfg.execOp(instr, ctx);
		case "phi": return cfg.execPhi(instr, ctx);
		case "spawn": return cfg.execSpawn(instr, ctx);
		case "channelOp": return cfg.execChannelOp(instr, ctx);
		case "await": return cfg.execAwait(instr, ctx);
		default: return errorVal(ErrorCodes.UnknownOperator, `Unknown instruction: ${instr.kind}`);
		}
	}

	private async execTerminator(
		term: EirTerminator,
		blockMap: Map<string, EirBlock>,
		ctx: AsyncEvalContext,
	): Promise<{ done: boolean; value?: Value; nextBlock?: string }> {
		switch (term.kind) {
		case "jump": return { done: false, nextBlock: term.to };
		case "branch": return this.execBranch(term, ctx);
		case "return": return { done: true, value: term.value ? ctx.nodeValues.get(term.value) ?? voidVal() : voidVal() };
		case "fork": return cfg.execFork(term, blockMap, ctx);
		case "join": return cfg.execJoin(term, ctx);
		case "suspend": return cfg.execSuspend(term, ctx);
		default: return { done: true, value: errorVal(ErrorCodes.UnknownOperator, `Unknown terminator: ${term.kind}`) };
		}
	}

	private execBranch(
		term: { kind: "branch"; cond: string; then: string; else: string },
		ctx: AsyncEvalContext,
	): { done: boolean; value?: Value; nextBlock?: string } {
		const condValue = ctx.nodeValues.get(term.cond);
		if (condValue?.kind !== "bool") {
			return { done: true, value: errorVal(ErrorCodes.TypeError, "Branch condition must be boolean") };
		}
		return { done: false, nextBlock: condValue.value ? term.then : term.else };
	}
}

//==============================================================================
// Factory Functions
//==============================================================================

export function createAsyncEvaluator(
	registry: OperatorRegistry,
	defs: Defs,
	effectRegistry?: EffectRegistry,
): AsyncEvaluator {
	return new AsyncEvaluator(registry, defs, effectRegistry);
}
