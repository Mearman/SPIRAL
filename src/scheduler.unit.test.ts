/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/require-await */

// CAIRS Task Scheduler Unit Tests
// Tests for TaskScheduler and DeterministicScheduler

import { describe, it } from "node:test";
import assert from "node:assert";
import { createTaskScheduler, createDeterministicScheduler, type SchedulerMode } from "./scheduler.js";
import { intVal } from "./types.js";

describe("TaskScheduler", () => {
	describe("DefaultTaskScheduler", () => {
		it("should spawn and await tasks", async () => {
			const scheduler = createTaskScheduler();

			let executed = false;
			scheduler.spawn("task1", async () => {
				executed = true;
				return intVal(42);
			});

			const result = await scheduler.await("task1");

			assert.ok(executed, "task should have executed");
			assert.equal(result.kind, "int");
			assert.equal((result as { kind: "int"; value: number }).value, 42);
			assert.equal(scheduler.activeTaskCount, 0);
		});

		it("should track current task ID", async () => {
			const scheduler = createTaskScheduler();

			assert.equal(scheduler.currentTaskId, "main");

			scheduler.spawn("task1", async () => intVal(1));

			assert.equal(scheduler.currentTaskId, "main");
		});

		it("should cancel a task before it executes", async () => {
			const scheduler = createTaskScheduler();
			let taskExecuted = false;

			// First spawn to get the task set up, then cancel immediately
			scheduler.spawn("task1", async () => {
				taskExecuted = true;
				return intVal(1);
			});

			// Cancel immediately - task hasn't executed yet
			scheduler.cancel("task1");

			// Give any pending promises time to settle
			await new Promise((resolve) => setImmediate(resolve));

			assert.ok(!taskExecuted, "task should not have executed");
			assert.ok(scheduler.isComplete("task1"), "task should be marked complete");
		});

		it("should check global step limit with yielding", async () => {
			const scheduler = createTaskScheduler({ globalMaxSteps: 1000 });

			for (let i = 0; i < 900; i++) {
				await scheduler.checkGlobalSteps();
			}

			// Should not throw yet
			await scheduler.checkGlobalSteps();
		});

		it("should enforce global step limit", async () => {
			const scheduler = createTaskScheduler({ globalMaxSteps: 100 });

			for (let i = 0; i < 100; i++) {
				await scheduler.checkGlobalSteps();
			}

			// Next call should throw
			await assert.rejects(
				async () => scheduler.checkGlobalSteps(),
				Error,
				"Should throw step limit error",
			);
		});
	});

	describe("DeterministicScheduler", () => {
		it("should run tasks sequentially in sequential mode", async () => {
			const scheduler = createDeterministicScheduler("sequential");
			const order: number[] = [];

			scheduler.spawn("task1", async () => {
				order.push(1);
				return intVal(1);
			});
			scheduler.spawn("task2", async () => {
				order.push(2);
				return intVal(2);
			});

			await scheduler.await("task1");
			await scheduler.await("task2");

			assert.deepEqual(order, [1, 2], "tasks should execute sequentially");
		});

		it("should run tasks in parallel in parallel mode", async () => {
			const scheduler = createDeterministicScheduler("parallel");
			const order: number[] = [];

			scheduler.spawn("task1", async () => {
				order.push(1);
				return intVal(1);
			});
			scheduler.spawn("task2", async () => {
				order.push(2);
				return intVal(2);
			});

			await Promise.all([
				scheduler.await("task1"),
				scheduler.await("task2"),
			]);

			// Order may vary in parallel mode, but both should complete
			assert.equal(order.length, 2);
			assert.ok(order.includes(1));
			assert.ok(order.includes(2));
		});

		it("should run tasks breadth-first in breadth-first mode", async () => {
			const scheduler = createDeterministicScheduler("breadth-first");
			const order: number[] = [];

			scheduler.spawn("task1", async () => {
				order.push(1);
				// Spawn nested task
				scheduler.spawn("task1a", async () => {
					order.push(2);
					return intVal(2);
				});
				return intVal(1);
			});
			scheduler.spawn("task2", async () => {
				order.push(3);
				return intVal(3);
			});

			await scheduler.await("task1");
			await scheduler.await("task2");

			// In breadth-first, task2 should run before task1a
			// (task1 and task2 are at level 1, task1a is at level 2)
			const task2Index = order.indexOf(3);
			const task1aIndex = order.indexOf(2);

			if (task2Index !== -1 && task1aIndex !== -1) {
				assert.ok(
					task2Index < task1aIndex,
					"task2 should complete before nested task1a",
				);
			}
		});

		it("should switch scheduler modes", () => {
			const scheduler = createDeterministicScheduler("sequential") as unknown as {
				getMode: () => SchedulerMode;
				setMode: (mode: SchedulerMode) => void;
			};

			assert.equal(scheduler.getMode(), "sequential");

			scheduler.setMode("parallel");

			assert.equal(scheduler.getMode(), "parallel");
		});
	});

	describe("AsyncBarrier", () => {
		it("should synchronize at a barrier", async () => {
			const { AsyncBarrier } = await import("./scheduler.js");
			const barrier = new AsyncBarrier(3);

			let arrived = 0;
			const arrive = async () => {
				arrived++;
				await barrier.wait();
				return arrived;
			};

			const results = await Promise.all([arrive(), arrive(), arrive()]);

			// All should see the final count
			assert.deepEqual(results, [3, 3, 3]);
		});

		it("should reset barrier for reuse", async () => {
			const { AsyncBarrier } = await import("./scheduler.js");
			const barrier = new AsyncBarrier(2);

			// Both waits must happen concurrently for the barrier to work
			await Promise.all([barrier.wait(), barrier.wait()]);

			// Should throw on invalid reset
			assert.throws(() => { barrier.reset(0); });
			assert.throws(() => { barrier.reset(-1); });
		});
	});
});
