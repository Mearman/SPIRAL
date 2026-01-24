// SPIRAL LIR Async CFG Execution Tests
// Tests for LIR async/parallel execution with fork/join/suspend terminators
// and spawn/channelOp/await instructions

import { describe, it, before } from "node:test";
import assert from "node:assert";
import {
	evaluateLIRAsync,
	executeForkTerminator,
	executeJoinTerminator,
	executeSuspendTerminator,
	executeSpawnInstruction,
	executeChannelOpInstruction,
	executeAwaitInstruction,
	type LIRAsyncRuntimeState,
	type LIRAsyncEvalOptions,
} from "../src/lir/async-evaluator.js";
import {
	intVal,
	boolVal,
	voidVal,
	stringVal,
	errorVal,
	futureVal,
	channelVal,
	isError,
	isFuture,
	isChannel,
	type Value,
	type LIRDocument,
	type LirBlock,
	type LirHybridNode,
	type PirInsSpawn,
	type PirInsChannelOp,
	type PirInsAwait,
	type PirTermFork,
	type PirTermJoin,
	type PirTermSuspend,
} from "../src/types.js";
import {
	emptyRegistry,
	defineOperator,
	registerOperator,
	type OperatorRegistry,
} from "../src/domains/registry.js";
import {
	emptyEffectRegistry,
	registerEffect,
	type EffectRegistry,
} from "../src/effects.js";
import {
	createTaskScheduler,
	type TaskScheduler,
} from "../src/scheduler.js";
import {
	createAsyncChannelStore,
	type AsyncChannelStore,
} from "../src/async-effects.js";
import {
	emptyValueEnv,
	extendValueEnv,
} from "../src/env.js";

//==============================================================================
// Test Helpers
//==============================================================================

function createMockState(
	scheduler?: TaskScheduler,
	channels?: AsyncChannelStore,
): LIRAsyncRuntimeState {
	return {
		vars: emptyValueEnv(),
		effects: [],
		steps: 0,
		maxSteps: 10000,
		taskId: "main",
		scheduler: scheduler ?? createTaskScheduler(),
		channels: channels ?? createAsyncChannelStore(),
		refCells: new Map(),
	};
}

function createSimpleLIRDocument(
	nodes: LirHybridNode[],
	result: string,
): LIRDocument {
	return {
		version: "1.0.0",
		nodes,
		result,
	};
}

function createBlockNode(
	id: string,
	blocks: LirBlock[],
): LirHybridNode {
	return {
		id,
		kind: "block",
		blocks,
		entry: blocks[0]?.id ?? "entry",
	};
}

function createBlock(
	id: string,
	instructions: any[],
	terminator: any,
): LirBlock {
	return {
		id,
		instructions,
		terminator,
	};
}

function createJumpTerminator(to: string) {
	return { kind: "jump", to };
}

function createReturnTerminator(value?: string) {
	return { kind: "return", value };
}

function createAssignInstruction(target: string, value: any) {
	return { kind: "assign", target, value };
}

function createOpInstruction(
	target: string,
	ns: string,
	name: string,
	args: string[],
) {
	return { kind: "op", target, ns, name, args };
}

//==============================================================================
// Test Suite
//==============================================================================

describe("LIR Async CFG Execution", () => {
	let registry: OperatorRegistry;
	let effectRegistry: EffectRegistry;

	before(() => {
		// Initialize basic math operators for tests
		registry = emptyRegistry();

		// Addition operator
		const addOp = defineOperator("math", "add")
			.setParams({ kind: "int" }, { kind: "int" })
			.setReturns({ kind: "int" })
			.setPure(true)
			.setImpl((a: Value, b: Value) => {
				const av = a as { kind: "int"; value: number };
				const bv = b as { kind: "int"; value: number };
				return intVal(av.value + bv.value);
			})
			.build();
		registry = registerOperator(registry, addOp);

		// Multiplication operator
		const mulOp = defineOperator("math", "mul")
			.setParams({ kind: "int" }, { kind: "int" })
			.setReturns({ kind: "int" })
			.setPure(true)
			.setImpl((a: Value, b: Value) => {
				const av = a as { kind: "int"; value: number };
				const bv = b as { kind: "int"; value: number };
				return intVal(av.value * bv.value);
			})
			.build();
		registry = registerOperator(registry, mulOp);

		// Division operator
		const divOp = defineOperator("math", "div")
			.setParams({ kind: "int" }, { kind: "int" })
			.setReturns({ kind: "int" })
			.setPure(true)
			.setImpl((a: Value, b: Value) => {
				const av = a as { kind: "int"; value: number };
				const bv = b as { kind: "int"; value: number };
				if (bv.value === 0) {
					return errorVal("DomainError", "Division by zero");
				}
				return intVal(Math.floor(av.value / bv.value));
			})
			.build();
		registry = registerOperator(registry, divOp);

		effectRegistry = emptyEffectRegistry();
	});

	//==========================================================================
	// Fork Terminator Tests
	//==========================================================================

	describe("Fork Terminator", () => {
		it("should execute basic fork with 2 branches", async () => {
			const state = createMockState();

			// Create two blocks that will be forked
			const block1 = createBlock(
				"block1",
				[createAssignInstruction("x1", { kind: "lit", type: { kind: "int" }, value: "10" })],
				createReturnTerminator("x1"),
			);

			const block2 = createBlock(
				"block2",
				[createAssignInstruction("x2", { kind: "lit", type: { kind: "int" }, value: "20" })],
				createReturnTerminator("x2"),
			);

			const blocks = [block1, block2];
			const nodeMap = new Map<string, LirHybridNode>([
				[createBlockNode("result", blocks).id, createBlockNode("result", blocks)],
			]);

			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "block1", taskId: "task1" },
					{ block: "block2", taskId: "task2" },
				],
				continuation: "continuation",
			};

			const result = await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			assert.strictEqual(result, "continuation");
		});

		it("should execute fork with 3+ branches", async () => {
			const state = createMockState();

			const blocks = [
				createBlock("block1", [], createReturnTerminator()),
				createBlock("block2", [], createReturnTerminator()),
				createBlock("block3", [], createReturnTerminator()),
			];

			const nodeMap = new Map<string, LirHybridNode>([
				[createBlockNode("result", blocks).id, createBlockNode("result", blocks)],
			]);

			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "block1", taskId: "task1" },
					{ block: "block2", taskId: "task2" },
					{ block: "block3", taskId: "task3" },
				],
				continuation: "continuation",
			};

			const result = await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			assert.strictEqual(result, "continuation");
		});

		it("should handle fork returning to continuation block", async () => {
			const state = createMockState();

			const blocks = [
				createBlock("branch1", [], createJumpTerminator("end")),
				createBlock("branch2", [], createJumpTerminator("end")),
				createBlock("continuation", [], createReturnTerminator()),
			];

			const nodeMap = new Map<string, LirHybridNode>([
				[createBlockNode("result", blocks).id, createBlockNode("result", blocks)],
			]);

			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "branch1", taskId: "task1" },
					{ block: "branch2", taskId: "task2" },
				],
				continuation: "continuation",
			};

			const result = await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			assert.strictEqual(result, "continuation");
		});

		it("should collect branch results after fork", async () => {
			const state = createMockState();
			state.vars = extendValueEnv(state.vars, "input1", intVal(5));
			state.vars = extendValueEnv(state.vars, "input2", intVal(10));

			const blocks = [
				createBlock(
					"branch1",
					[createOpInstruction("result1", "math", "add", ["input1", "input1"])],
					createReturnTerminator("result1"),
				),
				createBlock(
					"branch2",
					[createOpInstruction("result2", "math", "add", ["input2", "input2"])],
					createReturnTerminator("result2"),
				),
			];

			const nodeMap = new Map<string, LirHybridNode>([
				[createBlockNode("result", blocks).id, createBlockNode("result", blocks)],
			]);

			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "branch1", taskId: "task1" },
					{ block: "branch2", taskId: "task2" },
				],
				continuation: "continuation",
			};

			const result = await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			assert.strictEqual(result, "continuation");
			// Tasks should be available for await
			assert.strictEqual(state.scheduler.isComplete("task1"), true);
			assert.strictEqual(state.scheduler.isComplete("task2"), true);
		});

		it("should handle fork with missing blocks gracefully", async () => {
			const state = createMockState();

			const blocks: LirBlock[] = [];
			const nodeMap = new Map<string, LirHybridNode>();

			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "nonexistent", taskId: "task1" },
				],
				continuation: "continuation",
			};

			const result = await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			// Should continue despite missing block
			assert.strictEqual(result, "continuation");
		});
	});

	//==========================================================================
	// Join Terminator Tests
	//==========================================================================

	describe("Join Terminator", () => {
		it("should execute basic join with tasks", async () => {
			const state = createMockState();

			// Spawn two tasks that will be joined
			state.scheduler.spawn("task1", async () => intVal(10));
			state.scheduler.spawn("task2", async () => intVal(20));

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["task1", "task2"],
				to: "next",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "next");
		});

		it("should bind join results to variables", async () => {
			const state = createMockState();

			state.scheduler.spawn("task1", async () => intVal(10));
			state.scheduler.spawn("task2", async () => intVal(20));

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["task1", "task2"],
				results: ["result1", "result2"],
				to: "next",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "next");

			// Verify results were bound
			const result1 = state.vars.get("result1");
			const result2 = state.vars.get("result2");

			assert.ok(result1);
			assert.ok(result2);
			assert.strictEqual(result1.kind, "int");
			assert.strictEqual(result2.kind, "int");
		});

		it("should handle join with phi nodes in continuation", async () => {
			const state = createMockState();
			state.vars = extendValueEnv(state.vars, "pre_phi", intVal(0));

			state.scheduler.spawn("task1", async () => intVal(10));
			state.scheduler.spawn("task2", async () => intVal(20));

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["task1", "task2"],
				results: ["phi_input1", "phi_input2"],
				to: "phi_block",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "phi_block");

			// Phi inputs should be available
			const phiInput1 = state.vars.get("phi_input1");
			const phiInput2 = state.vars.get("phi_input2");

			assert.ok(phiInput1);
			assert.ok(phiInput2);
		});

		it("should handle empty task list in join", async () => {
			const state = createMockState();

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: [],
				to: "next",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "next");
		});

		it("should handle join with partial results binding", async () => {
			const state = createMockState();

			state.scheduler.spawn("task1", async () => intVal(10));
			state.scheduler.spawn("task2", async () => intVal(20));

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["task1", "task2"],
				results: ["result1"], // Only bind first result
				to: "next",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "next");

			const result1 = state.vars.get("result1");
			assert.ok(result1);
			assert.strictEqual(result1.kind, "int");
		});
	});

	//==========================================================================
	// Suspend Terminator Tests
	//==========================================================================

	describe("Suspend Terminator", () => {
		it("should execute basic suspend/resume", async () => {
			const state = createMockState();

			// Create a future that will resolve
			const future = futureVal("task1", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			// Spawn the task
			state.scheduler.spawn("task1", async () => intVal(42));

			const suspendTerm: PirTermSuspend = {
				kind: "suspend",
				future: "future1",
				resumeBlock: "resume",
			};

			const result = await executeSuspendTerminator(suspendTerm, state);

			assert.strictEqual(result, "resume");
		});

		it("should handle multiple suspend points", async () => {
			const state = createMockState();

			const future1 = futureVal("task1", "pending");
			const future2 = futureVal("task2", "pending");

			state.vars = extendValueEnv(state.vars, "future1", future1);
			state.vars = extendValueEnv(state.vars, "future2", future2);

			state.scheduler.spawn("task1", async () => intVal(10));
			state.scheduler.spawn("task2", async () => intVal(20));

			const suspendTerm1: PirTermSuspend = {
				kind: "suspend",
				future: "future1",
				resumeBlock: "resume1",
			};

			const result1 = await executeSuspendTerminator(suspendTerm1, state);
			assert.strictEqual(result1, "resume1");

			const suspendTerm2: PirTermSuspend = {
				kind: "suspend",
				future: "future2",
				resumeBlock: "resume2",
			};

			const result2 = await executeSuspendTerminator(suspendTerm2, state);
			assert.strictEqual(result2, "resume2");
		});

		it("should handle suspend with channel operations", async () => {
			const state = createMockState();

			// Create a channel
			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");

			// Create a future that will do a channel operation
			const future = futureVal("channel_task", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);
			state.vars = extendValueEnv(state.vars, "ch", channel);

			// Spawn task that sends to channel
			state.scheduler.spawn("channel_task", async () => {
				const ch = state.channels.get(channelId);
				if (ch) {
					await ch.send(intVal(42));
				}
				return voidVal();
			});

			const suspendTerm: PirTermSuspend = {
				kind: "suspend",
				future: "future1",
				resumeBlock: "after_send",
			};

			const result = await executeSuspendTerminator(suspendTerm, state);

			assert.strictEqual(result, "after_send");
		});

		it("should error on suspend with non-future value", async () => {
			const state = createMockState();

			// Use a non-future value
			state.vars = extendValueEnv(state.vars, "not_a_future", intVal(42));

			const suspendTerm: PirTermSuspend = {
				kind: "suspend",
				future: "not_a_future",
				resumeBlock: "resume",
			};

			const result = await executeSuspendTerminator(suspendTerm, state);

			assert.ok(isError(result));
			assert.strictEqual(result.kind, "error");
		});
	});

	//==========================================================================
	// Spawn Instruction Tests
	//==========================================================================

	describe("Spawn Instruction", () => {
		it("should spawn basic tasks", () => {
			const state = createMockState();

			const spawnIns: PirInsSpawn = {
				kind: "spawn",
				target: "future1",
				entry: "task_entry",
			};

			const result = executeSpawnInstruction(spawnIns, state);

			assert.strictEqual(result, undefined); // No error

			// Future should be created
			const future = state.vars.get("future1");
			assert.ok(future);
			assert.ok(isFuture(future));
		});

		it("should spawn tasks with arguments", () => {
			const state = createMockState();
			state.vars = extendValueEnv(state.vars, "arg1", intVal(10));
			state.vars = extendValueEnv(state.vars, "arg2", intVal(20));

			const spawnIns: PirInsSpawn = {
				kind: "spawn",
				target: "future1",
				entry: "task_entry",
				args: ["arg1", "arg2"],
			};

			const result = executeSpawnInstruction(spawnIns, state);

			assert.strictEqual(result, undefined);

			const future = state.vars.get("future1");
			assert.ok(future);
			assert.ok(isFuture(future));
		});

		it("should handle multiple concurrent spawns", () => {
			const state = createMockState();

			const spawn1: PirInsSpawn = {
				kind: "spawn",
				target: "future1",
				entry: "task1",
			};

			const spawn2: PirInsSpawn = {
				kind: "spawn",
				target: "future2",
				entry: "task2",
			};

			const spawn3: PirInsSpawn = {
				kind: "spawn",
				target: "future3",
				entry: "task3",
			};

			executeSpawnInstruction(spawn1, state);
			executeSpawnInstruction(spawn2, state);
			executeSpawnInstruction(spawn3, state);

			const future1 = state.vars.get("future1");
			const future2 = state.vars.get("future2");
			const future3 = state.vars.get("future3");

			assert.ok(future1 && isFuture(future1));
			assert.ok(future2 && isFuture(future2));
			assert.ok(future3 && isFuture(future3));
		});

		it("should handle spawn with missing arguments gracefully", () => {
			const state = createMockState();

			const spawnIns: PirInsSpawn = {
				kind: "spawn",
				target: "future1",
				entry: "task_entry",
				args: ["nonexistent_arg"],
			};

			const result = executeSpawnInstruction(spawnIns, state);

			// Should return error for missing argument
			assert.ok(isError(result));
		});
	});

	//==========================================================================
	// ChannelOp Instruction Tests
	//==========================================================================

	describe("ChannelOp Instruction", () => {
		it("should execute send instruction", async () => {
			const state = createMockState();

			// Create a channel
			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);
			state.vars = extendValueEnv(state.vars, "value", intVal(42));

			const sendOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "send",
				channel: "ch",
				value: "value",
			};

			const result = await executeChannelOpInstruction(sendOp, state);

			assert.strictEqual(result, undefined);

			// Verify value was sent
			const ch = state.channels.get(channelId);
			assert.ok(ch);
			assert.strictEqual(ch.size(), 1);
		});

		it("should execute recv instruction", async () => {
			const state = createMockState();

			// Create a channel and send a value
			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);

			const ch = state.channels.get(channelId);
			assert.ok(ch);
			await ch.send(intVal(42));

			const recvOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "recv",
				channel: "ch",
				target: "received",
			};

			const result = await executeChannelOpInstruction(recvOp, state);

			assert.strictEqual(result, undefined);

			const received = state.vars.get("received");
			assert.ok(received);
			assert.strictEqual(received.kind, "int");
			assert.strictEqual(received.value, 42);
		});

		it("should execute trySend instruction", async () => {
			const state = createMockState();

			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);
			state.vars = extendValueEnv(state.vars, "value", intVal(42));

			const trySendOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "trySend",
				channel: "ch",
				value: "value",
				target: "success",
			};

			const result = await executeChannelOpInstruction(trySendOp, state);

			assert.strictEqual(result, undefined);

			const success = state.vars.get("success");
			assert.ok(success);
			assert.strictEqual(success.kind, "int");
			assert.strictEqual(success.value, 1); // true
		});

		it("should execute tryRecv instruction", async () => {
			const state = createMockState();

			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);

			const ch = state.channels.get(channelId);
			assert.ok(ch);
			await ch.send(intVal(42));

			const tryRecvOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "tryRecv",
				channel: "ch",
				target: "received",
			};

			const result = await executeChannelOpInstruction(tryRecvOp, state);

			assert.strictEqual(result, undefined);

			const received = state.vars.get("received");
			assert.ok(received);
			assert.strictEqual(received.kind, "int");
			assert.strictEqual(received.value, 42);
		});

		it("should handle tryRecv on empty channel", async () => {
			const state = createMockState();

			const channelId = state.channels.create(0); // Unbuffered
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);

			const tryRecvOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "tryRecv",
				channel: "ch",
				target: "received",
			};

			const result = await executeChannelOpInstruction(tryRecvOp, state);

			assert.strictEqual(result, undefined);

			const received = state.vars.get("received");
			assert.ok(received);
			assert.strictEqual(received.kind, "void"); // Empty channel returns void
		});

		it("should handle channelOp with non-channel value", async () => {
			const state = createMockState();

			state.vars = extendValueEnv(state.vars, "not_a_channel", intVal(42));

			const sendOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "send",
				channel: "not_a_channel",
			};

			const result = await executeChannelOpInstruction(sendOp, state);

			assert.ok(isError(result));
		});

		it("should handle trySend on full channel", async () => {
			const state = createMockState();

			const channelId = state.channels.create(0); // Unbuffered (always full)
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);
			state.vars = extendValueEnv(state.vars, "value", intVal(42));

			const trySendOp: PirInsChannelOp = {
				kind: "channelOp",
				op: "trySend",
				channel: "ch",
				value: "value",
				target: "success",
			};

			const result = await executeChannelOpInstruction(trySendOp, state);

			assert.strictEqual(result, undefined);

			const success = state.vars.get("success");
			assert.ok(success);
			assert.strictEqual(success.kind, "int");
			assert.strictEqual(success.value, 0); // false
		});
	});

	//==========================================================================
	// Await Instruction Tests
	//==========================================================================

	describe("Await Instruction", () => {
		it("should execute basic await", async () => {
			const state = createMockState();

			// Create a task and future
			const future = futureVal("task1", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			state.scheduler.spawn("task1", async () => intVal(42));

			const awaitIns: PirInsAwait = {
				kind: "await",
				target: "result",
				future: "future1",
			};

			const result = await executeAwaitInstruction(awaitIns, state);

			assert.strictEqual(result, undefined);

			const awaited = state.vars.get("result");
			assert.ok(awaited);
			assert.strictEqual(awaited.kind, "int");
			assert.strictEqual(awaited.value, 42);
		});

		it("should handle await with timeout", async () => {
			const state = createMockState();

			// Create a slow task
			const future = futureVal("slow_task", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			state.scheduler.spawn("slow_task", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return intVal(42);
			});

			const awaitIns: PirInsAwait = {
				kind: "await",
				target: "result",
				future: "future1",
			};

			const result = await executeAwaitInstruction(awaitIns, state);

			assert.strictEqual(result, undefined);

			const awaited = state.vars.get("result");
			assert.ok(awaited);
			assert.strictEqual(awaited.kind, "int");
		});

		it("should handle multiple awaits of same future", async () => {
			const state = createMockState();

			const future = futureVal("task1", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			state.scheduler.spawn("task1", async () => intVal(42));

			const awaitIns1: PirInsAwait = {
				kind: "await",
				target: "result1",
				future: "future1",
			};

			const awaitIns2: PirInsAwait = {
				kind: "await",
				target: "result2",
				future: "future1",
			};

			await executeAwaitInstruction(awaitIns1, state);
			await executeAwaitInstruction(awaitIns2, state);

			const result1 = state.vars.get("result1");
			const result2 = state.vars.get("result2");

			assert.ok(result1 && result1.kind === "int");
			assert.ok(result2 && result2.kind === "int");
			assert.strictEqual(result1.value, 42);
			assert.strictEqual(result2.value, 42);
		});

		it("should error on await with non-future value", async () => {
			const state = createMockState();

			state.vars = extendValueEnv(state.vars, "not_a_future", intVal(42));

			const awaitIns: PirInsAwait = {
				kind: "await",
				target: "result",
				future: "not_a_future",
			};

			const result = await executeAwaitInstruction(awaitIns, state);

			assert.ok(isError(result));
		});

		it("should handle await of failed task", async () => {
			const state = createMockState();

			const future = futureVal("failing_task", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			state.scheduler.spawn("failing_task", async () => {
				throw new Error("Task failed");
			});

			const awaitIns: PirInsAwait = {
				kind: "await",
				target: "result",
				future: "future1",
			};

			// This should throw an error
			await assert.rejects(
				async () => await executeAwaitInstruction(awaitIns, state),
			);
		});
	});

	//==========================================================================
	// Integration Tests
	//==========================================================================

	describe("Integration Patterns", () => {
		it("should execute fork + join pattern", async () => {
			const state = createMockState();

			// Create blocks for parallel computation
			const blocks = [
				createBlock(
					"compute1",
					[createOpInstruction("x", "math", "add", ["5", "5"])],
					createReturnTerminator("x"),
				),
				createBlock(
					"compute2",
					[createOpInstruction("y", "math", "mul", ["3", "7"])],
					createReturnTerminator("y"),
				),
			];

			const nodeMap = new Map<string, LirHybridNode>([
				[createBlockNode("result", blocks).id, createBlockNode("result", blocks)],
			]);

			// Initialize inputs
			state.vars = extendValueEnv(state.vars, "5", intVal(5));
			state.vars = extendValueEnv(state.vars, "3", intVal(3));
			state.vars = extendValueEnv(state.vars, "7", intVal(7));

			// Execute fork
			const forkTerm: PirTermFork = {
				kind: "fork",
				branches: [
					{ block: "compute1", taskId: "task1" },
					{ block: "compute2", taskId: "task2" },
				],
				continuation: "continuation",
			};

			await executeForkTerminator(
				forkTerm,
				state,
				blocks,
				nodeMap,
				registry,
				effectRegistry,
			);

			// Join results
			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["task1", "task2"],
				results: ["r1", "r2"],
				to: "end",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "end");
		});

		it("should handle channel communication between blocks", async () => {
			const state = createMockState();

			// Create a channel
			const channelId = state.channels.create(1);
			const channel = channelVal(channelId, "mpsc");
			state.vars = extendValueEnv(state.vars, "ch", channel);

			// Spawn sender task
			state.scheduler.spawn("sender", async () => {
				const ch = state.channels.get(channelId);
				if (ch) {
					await ch.send(intVal(42));
				}
				return voidVal();
			});

			// Spawn receiver task
			state.scheduler.spawn("receiver", async () => {
				const ch = state.channels.get(channelId);
				if (ch) {
					return await ch.recv();
				}
				return voidVal();
			});

			// Wait for both to complete
			const senderResult = await state.scheduler.await("sender");
			const receiverResult = await state.scheduler.await("receiver");

			assert.strictEqual(senderResult.kind, "void");
			assert.strictEqual(receiverResult.kind, "int");
			assert.strictEqual(receiverResult.value, 42);
		});

		it("should execute complex async CFG workflow", async () => {
			const state = createMockState();

			// Create a workflow: spawn -> suspend -> await -> join
			const future = futureVal("worker", "pending");
			state.vars = extendValueEnv(state.vars, "future1", future);

			// Spawn worker
			state.scheduler.spawn("worker", async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return intVal(100);
			});

			// Suspend until worker is done
			const suspendTerm: PirTermSuspend = {
				kind: "suspend",
				future: "future1",
				resumeBlock: "continue",
			};

			const result = await executeSuspendTerminator(suspendTerm, state);

			assert.strictEqual(result, "continue");

			// Verify task completed
			assert.strictEqual(state.scheduler.isComplete("worker"), true);
		});

		it("should handle nested fork-join patterns", async () => {
			const state = createMockState();

			// First level: spawn two tasks
			state.scheduler.spawn("outer1", async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return intVal(1);
			});

			state.scheduler.spawn("outer2", async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return intVal(2);
			});

			// Wait for outer tasks
			await state.scheduler.await("outer1");
			await state.scheduler.await("outer2");

			// Second level: spawn inner tasks
			state.scheduler.spawn("inner1", async () => intVal(10));
			state.scheduler.spawn("inner2", async () => intVal(20));

			const joinTerm: PirTermJoin = {
				kind: "join",
				tasks: ["inner1", "inner2"],
				results: ["inner_result1", "inner_result2"],
				to: "final",
			};

			const result = await executeJoinTerminator(joinTerm, state);

			assert.strictEqual(result, "final");
		});

		it("should handle producer-consumer pattern with channels", async () => {
			const state = createMockState();

			const channelId = state.channels.create(5); // Buffered channel
			const channel = channelVal(channelId, "mpsc");

			// Producer
			state.scheduler.spawn("producer", async () => {
				const ch = state.channels.get(channelId);
				if (ch) {
					for (let i = 0; i < 5; i++) {
						await ch.send(intVal(i));
					}
					ch.close();
				}
				return voidVal();
			});

			// Consumer
			state.scheduler.spawn("consumer", async () => {
				const ch = state.channels.get(channelId);
				const results: number[] = [];
				if (ch) {
					for (let i = 0; i < 5; i++) {
						const val = await ch.recv();
						if (val.kind === "int") {
							results.push(val.value);
						}
					}
				}
				return intVal(results.reduce((a, b) => a + b, 0));
			});

			const producerResult = await state.scheduler.await("producer");
			const consumerResult = await state.scheduler.await("consumer");

			assert.strictEqual(producerResult.kind, "void");
			assert.strictEqual(consumerResult.kind, "int");
			assert.strictEqual(consumerResult.value, 10); // 0+1+2+3+4
		});
	});

	//==========================================================================
	// Full Document Evaluation Tests
	//==========================================================================

	describe("Full Document Evaluation", () => {
		it("should evaluate simple async LIR document", async () => {
			const blocks = [
				createBlock("entry", [], createReturnTerminator()),
			];

			const doc = createSimpleLIRDocument(
				[createBlockNode("main", blocks)],
				"main",
			);

			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
			);

			assert.strictEqual(result.result.kind, "void");
		});

		it("should handle LIR document with async operations", async () => {
			const state = createMockState();

			// Simple document that uses a custom scheduler with pre-spawned tasks
			const blocks = [
				createBlock(
					"entry",
					[
						createAssignInstruction("x", { kind: "lit", type: { kind: "int" }, value: "42" }),
					],
					createReturnTerminator("x"),
				),
			];

			const doc = createSimpleLIRDocument(
				[createBlockNode("main", blocks)],
				"main",
			);

			// Add scheduler to options - test that custom scheduler works
			const options: LIRAsyncEvalOptions = {
				scheduler: state.scheduler,
				channels: state.channels,
			};

			// Spawn some background tasks that the scheduler should handle
			state.scheduler.spawn("bg_task1", async () => intVal(1));
			state.scheduler.spawn("bg_task2", async () => intVal(2));

			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
				undefined,
				options,
			);

			// Document should complete successfully
			assert.strictEqual(result.result.kind, "int");
			assert.strictEqual((result.result as { value: number }).value, 42);

			// Background tasks should still be trackable
			assert.strictEqual(state.scheduler.isComplete("bg_task1"), true);
			assert.strictEqual(state.scheduler.isComplete("bg_task2"), true);
		});

		it("should handle errors in async execution gracefully", async () => {
			const blocks = [
				createBlock(
					"entry",
					[createOpInstruction("x", "math", "div", ["10", "0"])],
					createReturnTerminator("x"),
				),
			];

			const doc = createSimpleLIRDocument(
				[createBlockNode("main", blocks)],
				"main",
			);

			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
			);

			// Should get an error value
			assert.ok(result.result.kind === "error" || result.result.kind === "void");
		});
	});

	//==========================================================================
	// Error Handling Tests
	//==========================================================================

	describe("Error Handling", () => {
		it("should handle maximum steps exceeded", async () => {
			const state = createMockState();
			state.maxSteps = 5;

			// Create a loop that will exceed steps
			const blocks = [
				createBlock("entry", [], createJumpTerminator("entry")),
			];

			const doc = createSimpleLIRDocument(
				[createBlockNode("main", blocks)],
				"main",
			);

			const options: LIRAsyncEvalOptions = {
				maxSteps: 5,
				scheduler: state.scheduler,
			};

			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
				undefined,
				options,
			);

			assert.ok(result.result.kind === "error");
		});

		it("should handle missing entry block", async () => {
			const doc = createSimpleLIRDocument(
				[createBlockNode("main", [])],
				"main",
			);

			// Node has empty blocks array, entry won't be found
			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
			);

			assert.ok(result.result.kind === "error");
		});

		it("should handle invalid result node", async () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [],
				result: "nonexistent",
			};

			const result = await evaluateLIRAsync(
				doc,
				registry,
				effectRegistry,
			);

			assert.ok(result.result.kind === "error");
		});
	});
});
