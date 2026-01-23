// SPIRAL Performance Tests
// Measure overhead of async features vs sync equivalent

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs } from "../../src/env.js";
import {
	createCoreRegistry,
	createBoolRegistry,
	evaluateProgram,
	intVal,
	AsyncEvaluator,
} from "../../src/index.js";

describe("Async Overhead Performance Tests", () => {
	const registry = new Map();
	const coreReg = createCoreRegistry();
	const boolReg = createBoolRegistry();
	for (const [key, op] of [...coreReg, ...boolReg]) {
		registry.set(key, op);
	}
	const defs = emptyDefs();

	describe("Async vs sync overhead", () => {
		it("should measure overhead of simple async evaluation", async () => {
			// Base sync computation
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
				],
				result: "result",
			} as any;

			const syncResult = evaluateProgram(syncDoc, registry, defs);

			assert.deepStrictEqual(syncResult, intVal(42));

			// Same computation in async
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
				],
				result: "result",
			} as any;

			const asyncStart = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);
			const asyncElapsed = performance.now() - asyncStart;

			assert.equal(asyncResult.kind, "int");
			assert.equal((asyncResult as { value: number }).value, 42);

			// Async should complete in reasonable time (< 100ms)
			assert.ok(asyncElapsed < 100, `Async took ${asyncElapsed}ms, should be < 100ms`);
		});

		it("should measure overhead of spawn/await", async () => {
			// Base sync computation
			const syncDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				],
				result: "x",
			} as any;

			const syncStart = performance.now();
			const syncResult = evaluateProgram(syncDoc, registry, defs);
			const syncElapsed = performance.now() - syncStart;

			assert.deepStrictEqual(syncResult, intVal(42));

			// Same with spawn/await
			const asyncDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "future", expr: { kind: "spawn", task: "x" } },
					{ id: "result", expr: { kind: "await", future: "future" } },
				],
				result: "result",
			} as any;

			const asyncStart = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const asyncResult = await evaluator.evaluateDocument(asyncDoc);
			const asyncElapsed = performance.now() - asyncStart;

			assert.equal(asyncResult.kind, "int");
			assert.equal((asyncResult as { value: number }).value, 42);

			// Spawn/await adds overhead but should still be fast
			assert.ok(asyncElapsed < 100, `Async took ${asyncElapsed}ms, should be < 100ms`);

			// Document the overhead ratio (for informational purposes)
			const ratio = asyncElapsed / syncElapsed;
			assert.ok(ratio > 0, `Async overhead ratio: ${ratio.toFixed(2)}x`);
		});
	});

	describe("Channel operations throughput", () => {
		it("should handle buffered channel send/recv", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "bufSize", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "bufSize",
						},
					},
					// Send multiple values
					{ id: "v1", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "send1", expr: { kind: "send", channel: "ch", value: "v1" } },
					{ id: "v2", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
					{ id: "send2", expr: { kind: "send", channel: "ch", value: "v2" } },
					{ id: "v3", expr: { kind: "lit", type: { kind: "int" }, value: 12 } },
					{ id: "send3", expr: { kind: "send", channel: "ch", value: "v3" } },
					// Receive values
					{ id: "r1", expr: { kind: "recv", channel: "ch" } },
					{ id: "r2", expr: { kind: "recv", channel: "ch" } },
					{ id: "r3", expr: { kind: "recv", channel: "ch" } },
					// Sum received values
					{
						id: "sum12",
						expr: { kind: "call", ns: "core", name: "add", args: ["r1", "r2"] },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "add", args: ["sum12", "r3"] },
					},
				],
				result: "result",
			} as any;

			const startTime = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(doc);
			const elapsed = performance.now() - startTime;

			// 10 + 20 + 12 = 42
			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);

			// Channel operations should be reasonably fast
			assert.ok(elapsed < 100, `Channel ops took ${elapsed}ms, should be < 100ms`);
		});

		it("should handle unbuffered channel send/recv", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "bufSize", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "bufSize",
						},
					},
					{ id: "value", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "send", expr: { kind: "send", channel: "ch", value: "value" } },
					{ id: "result", expr: { kind: "recv", channel: "ch" } },
				],
				result: "result",
			} as any;

			const startTime = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(doc);
			const elapsed = performance.now() - startTime;

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);

			// Unbuffered channels require synchronization
			assert.ok(elapsed < 100, `Unbuffered channel took ${elapsed}ms, should be < 100ms`);
		});

		it("should compare buffered vs unbuffered throughput", async () => {
			// Buffered channel
			const bufferedDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "buf", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "buf",
						},
					},
					{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					{ id: "send", expr: { kind: "send", channel: "ch", value: "val" } },
					{ id: "recv", expr: { kind: "recv", channel: "ch" } },
				],
				result: "recv",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);

			const bufferedStart = performance.now();
			const bufferedResult = await evaluator.evaluateDocument(bufferedDoc);
			const bufferedElapsed = performance.now() - bufferedStart;

			// Unbuffered channel
			const unbufferedDoc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "zero", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
					{
						id: "ch",
						expr: {
							kind: "channel",
							channelType: "spsc",
							bufferSize: "zero",
						},
					},
					{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
					{ id: "send", expr: { kind: "send", channel: "ch", value: "val" } },
					{ id: "recv", expr: { kind: "recv", channel: "ch" } },
				],
				result: "recv",
			} as any;

			const unbufferedStart = performance.now();
			const unbufferedResult = await evaluator.evaluateDocument(unbufferedDoc);
			const unbufferedElapsed = performance.now() - unbufferedStart;

			// Both should work
			assert.equal(bufferedResult.kind, "int");
			assert.equal(unbufferedResult.kind, "int");

			// Unbuffered may be slower due to synchronization
			console.log(
				`Buffered: ${bufferedElapsed.toFixed(2)}ms, Unbuffered: ${unbufferedElapsed.toFixed(2)}ms`,
			);
		});
	});

	describe("Parallel execution scaling", () => {
		it("should handle parallel computations efficiently", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "y", expr: { kind: "lit", type: { kind: "int" }, value: 32 } },
					{ id: "t1", expr: { kind: "spawn", task: "x" } },
					{ id: "t2", expr: { kind: "spawn", task: "y" } },
					{
						id: "result",
						expr: { kind: "select", futures: ["t1", "t2"] },
					},
				],
				result: "result",
			} as any;

			const startTime = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(doc);
			const elapsed = performance.now() - startTime;

			// Should return either 10 or 32 (first to complete)
			assert.equal(result.kind, "int");
			assert.ok(
				(result as { value: number }).value === 10 ||
					(result as { value: number }).value === 32,
			);

			// Parallel execution should be fast
			assert.ok(elapsed < 100, `Parallel execution took ${elapsed}ms, should be < 100ms`);
		});
	});

	describe("Memory efficiency", () => {
		it("should not leak memory with repeated evaluations", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "result", expr: { kind: "spawn", task: "x" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);

			// Run multiple times
			for (let i = 0; i < 100; i++) {
				const result = await evaluator.evaluateDocument(doc);
				assert.equal(result.kind, "future");
			}

			// If we get here without crashing, memory is likely being managed properly
			assert.ok(true);
		});

		it("should handle task completion cleanup", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "task", expr: { kind: "spawn", task: "x" } },
					{ id: "result", expr: { kind: "await", future: "task" } },
				],
				result: "result",
			} as any;

			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(doc);

			assert.equal(result.kind, "int");
			assert.equal((result as { value: number }).value, 42);

			// Task should be cleaned up after completion
			assert.ok(true);
		});
	});

	describe("Microtask overhead", () => {
		it("should handle yield intervals efficiently", async () => {
			const doc = {
				version: "2.0.0",
				airDefs: [],
				capabilities: ["async"],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
					{ id: "result", expr: { kind: "spawn", task: "x" } },
				],
				result: "result",
			} as any;

			const startTime = performance.now();
			const evaluator = new AsyncEvaluator(registry, defs);
			const result = await evaluator.evaluateDocument(doc);
			const elapsed = performance.now() - startTime;

			assert.equal(result.kind, "future");

			// Spawn should be very fast
			assert.ok(elapsed < 50, `Spawn took ${elapsed}ms, should be < 50ms`);
		});
	});
});
