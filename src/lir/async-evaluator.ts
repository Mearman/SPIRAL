// SPIRAL LIR Async Evaluator
// Async CFG-based execution for LIR with fork/join/suspend terminators
// and spawn/channelOp/await instructions

import { SPIRALError, ErrorCodes, exhaustive } from "../errors.js";
import {
	type Defs,
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
	type ValueEnv,
} from "../env.js";
import {
	lookupOperator,
	type OperatorRegistry,
} from "../domains/registry.js";
import { lookupEffect, type EffectRegistry } from "../effects.js";
import type {
	Expr,
	LIRDocument,
	LirBlock,
	LirHybridNode,
	LirInstruction,
	LirTerminator,
	PirInsSpawn,
	PirInsChannelOp,
	PirInsAwait,
	PirTermFork,
	PirTermJoin,
	PirTermSuspend,
	PirTerminator,
	PirInstruction,
	Value,
} from "../types.js";
import {
	errorVal,
	intVal,
	isBlockNode,
	isExprNode,
	isError,
	isFuture,
	isChannel,
	voidVal,
	futureVal,
} from "../types.js";
import { Evaluator } from "../evaluator.js";
import { createTaskScheduler, type TaskScheduler } from "../scheduler.js";
import { createAsyncChannelStore, type AsyncChannelStore } from "../async-effects.js";

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
	vars: ValueEnv; // Variable bindings (SSA form)
	returnValue?: Value;
	effects: { op: string; args: Value[] }[];
	steps: number;
	maxSteps: number;
	predecessor?: string; // Track which block we came from (for phi node resolution)
	taskId: string; // Current task ID for async operations
	scheduler: TaskScheduler; // Task scheduler for async execution
	channels: AsyncChannelStore; // Channel store for async communication
	refCells: Map<string, { kind: "refCell"; value: Value }>; // Reference cells
}

//==============================================================================
// LIR Async Evaluator
//==============================================================================

/**
 * Evaluate an LIR program asynchronously with CFG-based execution.
 *
 * LIR async execution follows control flow through basic blocks with async support:
 * - Start at entry block
 * - Execute instructions sequentially
 * - Execute terminator to determine next block (including async terminators)
 * - Handle fork/join/suspend for concurrent execution
 * - Continue until return/exit terminator
 */
export async function evaluateLIRAsync(
	doc: LIRDocument,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
	inputs?: ValueEnv,
	options?: LIRAsyncEvalOptions,
	defs?: Defs,
): Promise<{ result: Value; state: LIRAsyncRuntimeState }> {
	const scheduler = options?.scheduler ?? createTaskScheduler({
		globalMaxSteps: options?.maxSteps ?? 1_000_000,
	});

	const channels = createAsyncChannelStore();

	const state: LIRAsyncRuntimeState = {
		vars: inputs ?? emptyValueEnv(),
		effects: [],
		steps: 0,
		maxSteps: options?.maxSteps ?? 10000,
		taskId: "main",
		scheduler,
		channels,
		refCells: new Map(),
	};

	// Build node map for lookup
	const nodeMap = new Map<string, LirHybridNode>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	// Create an expression evaluator for hybrid node support
	const emptyDefs: Defs = new Map();
	const exprEvaluator = new Evaluator(registry, defs ?? emptyDefs);

	// First pass: evaluate expression nodes and store their values
	// This allows block nodes to reference expression node values
	for (const node of doc.nodes) {
		if (isExprNode(node)) {
			// Evaluate the expression with current vars as environment
			const value = exprEvaluator.evaluate(node.expr, state.vars);
			state.vars = extendValueEnv(state.vars, node.id, value);
		}
	}

	// Find the result node
	const resultNode = nodeMap.get(doc.result);
	if (!resultNode) {
		return {
			result: errorVal(
				ErrorCodes.ValidationError,
				"Result node not found: " + doc.result,
			),
			state,
		};
	}

	// Evaluate the result node
	if (isExprNode(resultNode)) {
		// Expression node - already evaluated, just return its value
		const value = lookupValue(state.vars, resultNode.id);
		return {
			result: value ?? errorVal(ErrorCodes.UnboundIdentifier, "Result node value not found"),
			state,
		};
	}

	if (!isBlockNode(resultNode)) {
		return {
			result: errorVal(
				ErrorCodes.DomainError,
				"Result node must be expression or block node",
			),
			state,
		};
	}

	// Execute block node's CFG
	const blocks = resultNode.blocks;
	const entry = resultNode.entry;

	// Validate entry block exists
	const entryBlock = blocks.find((b: LirBlock) => b.id === entry);
	if (!entryBlock) {
		return {
			result: errorVal(
				ErrorCodes.ValidationError,
				"Entry block not found: " + entry,
			),
			state,
		};
	}

	// Execute CFG starting from entry
	let currentBlockId: string | undefined = entry;
	const executedBlocks = new Set<string>();

	while (currentBlockId) {
		// Set the predecessor for phi node resolution
		// (state.predecessor is already set from the previous iteration, or undefined for entry)

		// Check for infinite loops (basic detection)
		if (executedBlocks.has(currentBlockId)) {
			// Allow revisiting blocks in loops, but track for potential infinite loops
			state.steps++;
			if (state.steps > state.maxSteps) {
				return {
					result: errorVal(ErrorCodes.NonTermination, "LIR async execution exceeded maximum steps"),
					state,
				};
			}
		} else {
			executedBlocks.add(currentBlockId);
		}

		// Find current block
		const currentBlock = blocks.find((b: LirBlock) => b.id === currentBlockId);
		if (!currentBlock) {
			return {
				result: errorVal(
					ErrorCodes.ValidationError,
					"Block not found: " + currentBlockId,
				),
				state,
			};
		}

		// Check global step limit via scheduler
		await state.scheduler.checkGlobalSteps();

		// Execute instructions (async version)
		const insResult = await executeBlockAsync(
			currentBlock,
			state,
			registry,
			effectRegistry,
		);
		if (insResult) {
			// Error during instruction execution
			return { result: insResult, state };
		}

		// Execute terminator to get next block (async version)
		const termResult = await executeTerminatorAsync(
			currentBlock.terminator,
			state,
			blocks,
			nodeMap,
			registry,
			effectRegistry,
		);

		if (typeof termResult === "object") {
			// Return value or error
			return { result: termResult, state };
		}

		// Update predecessor before moving to next block
		state.predecessor = currentBlockId;
		currentBlockId = termResult;
	}

	// If we exit the loop without a return, return void
	return {
		result: state.returnValue ?? voidVal(),
		state,
	};
}

/**
 * Execute all instructions in a basic block (async version).
 * Returns undefined on success, or an error Value on failure.
 */
async function executeBlockAsync(
	block: LirBlock,
	state: LIRAsyncRuntimeState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
): Promise<Value | undefined> {
	for (const ins of block.instructions) {
		state.steps++;
		if (state.steps > state.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block async execution exceeded maximum steps");
		}

		const result = await executeInstructionAsync(ins, state, registry, effectRegistry);
		if (result) {
			return result; // Error
		}
	}
	return undefined; // Success
}

/**
 * Execute a single LIR instruction (async version).
 * Returns undefined on success, or an error Value on failure.
 */
async function executeInstructionAsync(
	ins: LirInstruction | PirInstruction,
	state: LIRAsyncRuntimeState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
): Promise<Value | undefined> {
	switch (ins.kind) {
	case "assign": {
		// LirInsAssign: target = value (CIR expression)
		const value = evaluateExpr(ins.value, state.vars);
		if (value.kind === "error") {
			return value;
		}
		state.vars = extendValueEnv(state.vars, ins.target, value);
		// Also store in ref cells for async operations
		state.refCells.set(ins.target, { kind: "refCell", value });
		return undefined;
	}

	case "call": {
		// LirInsCall: target = callee(args)
		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		// For now, calls are not fully implemented (would require function definitions)
		state.vars = extendValueEnv(
			state.vars,
			ins.target,
			errorVal(ErrorCodes.DomainError, "Call not yet implemented in LIR async"),
		);
		return undefined;
	}

	case "op": {
		// LirInsOp: target = ns:name(args)
		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		const op = lookupOperator(registry, ins.ns, ins.name);
		if (!op) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				"Unknown operator: " + ins.ns + ":" + ins.name,
			);
		}

		if (op.params.length !== argValues.length) {
			return errorVal(
				ErrorCodes.ArityError,
				`Operator ${ins.ns}:${ins.name} expects ${op.params.length} args, got ${argValues.length}`,
			);
		}

		try {
			const result = op.fn(...argValues);
			state.vars = extendValueEnv(state.vars, ins.target, result);
			state.refCells.set(ins.target, { kind: "refCell", value: result });
			return undefined;
		} catch (e) {
			if (e instanceof SPIRALError) {
				return e.toValue();
			}
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	case "phi": {
		// LirInsPhi: target = phi(sources)
		// Phi nodes merge values from different control flow predecessors.
		// We select the value from the source whose block matches our predecessor.
		let phiValue: Value | undefined;

		// First, try to find a source matching the predecessor block
		if (state.predecessor) {
			for (const source of ins.sources) {
				if (source.block === state.predecessor) {
					const value = lookupValue(state.vars, source.id);
					if (value && value.kind !== "error") {
						phiValue = value;
						break;
					}
				}
			}
		}

		// Fallback: when no predecessor match, find which source's id variable exists
		if (!phiValue) {
			for (const source of ins.sources) {
				const value = lookupValue(state.vars, source.id);
				if (value && value.kind !== "error") {
					phiValue = value;
					break;
				}
			}
		}

		if (!phiValue) {
			return errorVal(
				ErrorCodes.DomainError,
				"Phi node has no valid sources: " + ins.target,
			);
		}

		state.vars = extendValueEnv(state.vars, ins.target, phiValue);
		state.refCells.set(ins.target, { kind: "refCell", value: phiValue });
		return undefined;
	}

	case "effect": {
		// LirInsEffect: target = op(args)
		const effectOp = lookupEffect(effectRegistry, ins.op);
		if (!effectOp) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				"Unknown effect operation: " + ins.op,
			);
		}

		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		if (effectOp.params.length !== argValues.length) {
			return errorVal(
				ErrorCodes.ArityError,
				`Effect ${ins.op} expects ${effectOp.params.length} args, got ${argValues.length}`,
			);
		}

		// Record effect
		state.effects.push({ op: ins.op, args: argValues });

		try {
			const result = effectOp.fn(...argValues);
			state.vars = extendValueEnv(state.vars, ins.target, result);
			state.refCells.set(ins.target, { kind: "refCell", value: result });
			return undefined;
		} catch (e) {
			if (e instanceof SPIRALError) {
				return e.toValue();
			}
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	case "assignRef": {
		// LirInsAssignRef: target ref cell = value
		const value = lookupValue(state.vars, ins.value);
		if (!value) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Value not found: " + ins.value,
			);
		}
		if (value.kind === "error") {
			return value;
		}

		// Store in ref cell
		state.refCells.set(ins.target, { kind: "refCell", value });
		return undefined;
	}

	// PIR-specific async instructions
	case "spawn": {
		return executeSpawnInstruction(ins, state);
	}

	case "channelOp": {
		return executeChannelOpInstruction(ins, state);
	}

	case "await": {
		return executeAwaitInstruction(ins, state);
	}

	default:
		return exhaustive(ins);
	}
}

/**
 * Execute a spawn instruction: creates a new async task
 */
export function executeSpawnInstruction(
	ins: PirInsSpawn,
	state: LIRAsyncRuntimeState,
): Value | undefined {
	const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	// Get argument values
	const argValues: Value[] = [];
	if (ins.args) {
		for (const argId of ins.args) {
			const value = lookupValue(state.vars, argId);
			if (!value) {
				return errorVal(ErrorCodes.UnboundIdentifier, `Spawn arg not found: ${argId}`);
			}
			argValues.push(value);
		}
	}

	// Spawn the task - the task entry will be resolved when awaited/joined
	// For now, create a pending future
	state.scheduler.spawn(taskId, () => {
		// The actual task execution happens when the entry block is resolved
		// This is a placeholder that returns void
		return Promise.resolve(voidVal());
	});

	const future = futureVal(taskId, "pending");
	state.vars = extendValueEnv(state.vars, ins.target, future);
	state.refCells.set(ins.target, { kind: "refCell", value: future });
	return undefined;
}

/**
 * Execute a channel operation instruction: send/recv/trySend/tryRecv
 */
export async function executeChannelOpInstruction(
	ins: PirInsChannelOp,
	state: LIRAsyncRuntimeState,
): Promise<Value | undefined> {
	const channelValue = lookupValue(state.vars, ins.channel);
	if (!channelValue || !isChannel(channelValue)) {
		return errorVal(ErrorCodes.TypeError, "channelOp requires a Channel value");
	}

	const channel = state.channels.get(channelValue.id);
	if (!channel) {
		return errorVal(ErrorCodes.DomainError, `Channel not found: ${channelValue.id}`);
	}

	switch (ins.op) {
	case "send": {
		const value = ins.value ? lookupValue(state.vars, ins.value) : voidVal();
		if (!value && ins.value) {
			return errorVal(ErrorCodes.DomainError, `Value not found: ${ins.value}`);
		}
		await channel.send(value ?? voidVal());
		return undefined;
	}

	case "recv": {
		const received = await channel.recv();
		if (ins.target) {
			state.vars = extendValueEnv(state.vars, ins.target, received);
			state.refCells.set(ins.target, { kind: "refCell", value: received });
		}
		return undefined;
	}

	case "trySend": {
		const value = ins.value ? lookupValue(state.vars, ins.value) : voidVal();
		if (!value && ins.value) {
			return errorVal(ErrorCodes.DomainError, `Value not found: ${ins.value}`);
		}
		const success = channel.trySend(value ?? voidVal());
		if (ins.target) {
			const result = intVal(success ? 1 : 0);
			state.vars = extendValueEnv(state.vars, ins.target, result);
			state.refCells.set(ins.target, { kind: "refCell", value: result });
		}
		return undefined;
	}

	case "tryRecv": {
		const result = channel.tryRecv();
		if (result === null) {
			// Channel is empty, return void value as indicator
			if (ins.target) {
				const empty = voidVal();
				state.vars = extendValueEnv(state.vars, ins.target, empty);
				state.refCells.set(ins.target, { kind: "refCell", value: empty });
			}
		} else {
			if (ins.target) {
				state.vars = extendValueEnv(state.vars, ins.target, result);
				state.refCells.set(ins.target, { kind: "refCell", value: result });
			}
		}
		return undefined;
	}

	default:
		return errorVal(ErrorCodes.UnknownOperator, `Unknown channelOp: ${String(ins.op)}`);
	}
}

/**
 * Execute an await instruction: wait for a future and store result
 */
export async function executeAwaitInstruction(
	ins: PirInsAwait,
	state: LIRAsyncRuntimeState,
): Promise<Value | undefined> {
	const futureValue = lookupValue(state.vars, ins.future);
	if (!futureValue || !isFuture(futureValue)) {
		return errorVal(ErrorCodes.TypeError, "await requires a Future value");
	}

	const result = await state.scheduler.await(futureValue.taskId);
	state.vars = extendValueEnv(state.vars, ins.target, result);
	state.refCells.set(ins.target, { kind: "refCell", value: result });
	return undefined;
}

/**
 * Execute a terminator to determine the next block (async version).
 * Returns the next block id, or a Value for return/exit.
 */
async function executeTerminatorAsync(
	term: LirTerminator | PirTerminator,
	state: LIRAsyncRuntimeState,
	blocks: LirBlock[],
	nodeMap: Map<string, LirHybridNode>,
	registry?: OperatorRegistry,
	effectRegistry?: EffectRegistry,
): Promise<string | Value> {
	switch (term.kind) {
	case "jump": {
		// LirTermJump: unconditional jump to block
		return term.to;
	}

	case "branch": {
		// LirTermBranch: conditional branch
		const condValue = lookupValue(state.vars, term.cond);
		if (!condValue) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Condition variable not found: " + term.cond,
			);
		}

		if (condValue.kind === "error") {
			return condValue;
		}

		if (condValue.kind !== "bool") {
			return errorVal(
				ErrorCodes.TypeError,
				`Branch condition must be bool, got: ${condValue.kind}`,
			);
		}

		return condValue.value ? term.then : term.else;
	}

	case "return": {
		// LirTermReturn: return value
		if (term.value) {
			const returnValue = lookupValue(state.vars, term.value);
			if (!returnValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Return value not found: " + term.value,
				);
			}
			state.returnValue = returnValue;
			return returnValue;
		}
		return voidVal();
	}

	case "exit": {
		// LirTermExit: exit with optional code
		if (term.code) {
			const codeValue = lookupValue(state.vars, term.code);
			if (codeValue) {
				return codeValue;
			}
		}
		return voidVal();
	}

	// PIR-specific async terminators
	case "fork": {
		if (!registry) {
			return errorVal(ErrorCodes.DomainError, "Fork terminator requires operator registry");
		}
		if (!effectRegistry) {
			return errorVal(ErrorCodes.DomainError, "Fork terminator requires effect registry");
		}
		return executeForkTerminator(term, state, blocks, nodeMap, registry, effectRegistry);
	}

	case "join": {
		return executeJoinTerminator(term, state);
	}

	case "suspend": {
		return executeSuspendTerminator(term, state);
	}

	default:
		return exhaustive(term);
	}
}

/**
 * Execute fork terminator: spawn branches concurrently, wait for all to complete
 */
export async function executeForkTerminator(
	term: PirTermFork,
	state: LIRAsyncRuntimeState,
	blocks: LirBlock[],
	nodeMap: Map<string, LirHybridNode>,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
): Promise<string | Value> {
	// Spawn all branch tasks concurrently
	for (const branch of term.branches) {
		const block = blocks.find((b) => b.id === branch.block);
		if (!block) {
			// Create a task that returns an error
			state.scheduler.spawn(branch.taskId, () => Promise.resolve(
				errorVal(ErrorCodes.DomainError, `Fork block not found: ${branch.block}`)
			));
			continue;
		}

		// Spawn task for this branch
		state.scheduler.spawn(branch.taskId, () => (async () => {
			// Execute the branch block
			for (const instr of block.instructions) {
				const result = await executeInstructionAsync(instr, state, registry, effectRegistry);
				if (result && isError(result)) {
					return result;
				}
			}

			// Execute branch terminator
			const termResult = await executeTerminatorAsync(block.terminator, state, blocks, nodeMap, registry, effectRegistry);
			if (typeof termResult !== "string") {
				return termResult; // Return value or error
			}

			return voidVal();
		})());
	}

	// Wait for all branch tasks to complete
	await Promise.all(
		term.branches.map((branch) => state.scheduler.await(branch.taskId))
	);

	// Continue to the continuation block
	return term.continuation;
}

/**
 * Execute join terminator: wait for tasks and bind results to variables
 */
export async function executeJoinTerminator(
	term: PirTermJoin,
	state: LIRAsyncRuntimeState,
): Promise<string | Value> {
	// Wait for all tasks to complete
	const results = await Promise.all(
		term.tasks.map((taskId) => state.scheduler.await(taskId))
	);

	// Bind results to variables if specified
	if (term.results) {
		for (let i = 0; i < results.length; i++) {
			const targetVar = term.results[i];
			const resultValue = results[i];
			if (targetVar !== undefined && resultValue !== undefined) {
				state.vars = extendValueEnv(state.vars, targetVar, resultValue);
				state.refCells.set(targetVar, { kind: "refCell", value: resultValue });
			}
		}
	}

	// Continue to the next block
	return term.to;
}

/**
 * Execute suspend terminator: await a future, then resume at resumeBlock
 */
export async function executeSuspendTerminator(
	term: PirTermSuspend,
	state: LIRAsyncRuntimeState,
): Promise<string | Value> {
	const futureValue = lookupValue(state.vars, term.future);
	if (!futureValue || !isFuture(futureValue)) {
		return errorVal(ErrorCodes.TypeError, "suspend requires a Future value");
	}

	// Await the future
	await state.scheduler.await(futureValue.taskId);

	// Resume at the specified block
	return term.resumeBlock;
}

/**
 * Evaluate a simple CIR expression (for LIR assign instruction).
 * Only supports literals and variables for now.
 */
function evaluateExpr(expr: Expr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "lit": {
		// For literals, return the value based on type
		const t = expr.type;
		const v = expr.value;
		switch (t.kind) {
		case "bool":
			return { kind: "bool", value: Boolean(v) };
		case "int":
			return intVal(Number(v));
		case "float":
			return { kind: "float", value: Number(v) };
		case "string":
			return { kind: "string", value: String(v) };
		case "void":
			return voidVal();
		default:
			return errorVal(ErrorCodes.TypeError, "Complex literals not yet supported in LIR async");
		}
	}

	case "var": {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
		}
		return value;
	}

	default:
		return errorVal(ErrorCodes.DomainError, "Complex expressions not yet supported in LIR async");
	}
}
