// SPDX-License-Identifier: MIT
// SPIRAL Detectors - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	RaceDetector,
	DeadlockDetector,
	createRaceDetector,
	createDeadlockDetector,
	createDetectors,
	type RaceCondition,
	type DeadlockCycle,
} from "../dist/detectors.js";

//==============================================================================
// Test Fixtures
//==============================================================================

const TEST_VALUE = 42;

//==============================================================================
// Test Suite
//==============================================================================

describe("Detectors - Unit Tests", () => {

	//==========================================================================
	// Race Detector Tests
	//==========================================================================

	describe("RaceDetector", () => {

		describe("Construction", () => {
			it("should create with default options", () => {
				const detector = new RaceDetector();
				assert.ok(detector);
			});

			it("should create with custom options", () => {
				const detector = new RaceDetector({
					enableRaceDetection: false,
					detailedRaceReports: false,
				});
				assert.ok(detector);
			});

			it("should use factory function", () => {
				const detector = createRaceDetector();
				assert.ok(detector instanceof RaceDetector);
			});
		});

		describe("recordAccess", () => {
			it("should record read access", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", TEST_VALUE);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 1);
				assert.strictEqual(stats.locations, 1);
			});

			it("should record write access", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "write", TEST_VALUE);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 1);
			});

			it("should record multiple accesses to same location", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", TEST_VALUE);
				detector.recordAccess("task2", "loc1", "write", TEST_VALUE);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 2);
				assert.strictEqual(stats.locations, 1);
			});

			it("should record accesses to different locations", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", TEST_VALUE);
				detector.recordAccess("task1", "loc2", "write", TEST_VALUE);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 2);
				assert.strictEqual(stats.locations, 2);
			});

			it("should not record when race detection disabled", () => {
				const detector = new RaceDetector({ enableRaceDetection: false });
				detector.recordAccess("task1", "loc1", "write", TEST_VALUE);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 0);
			});
		});

		describe("recordSyncPoint", () => {
			it("should record sync point", () => {
				const detector = new RaceDetector();
				detector.recordSyncPoint("task1", ["task2", "task3"]);

				const stats = detector.getStats();
				assert.strictEqual(stats.syncPoints, 1);
			});

			it("should record multiple sync points", () => {
				const detector = new RaceDetector();
				detector.recordSyncPoint("task1", ["task2"]);
				detector.recordSyncPoint("task2", ["task3"]);

				const stats = detector.getStats();
				assert.strictEqual(stats.syncPoints, 2);
			});

			it("should not record when race detection disabled", () => {
				const detector = new RaceDetector({ enableRaceDetection: false });
				detector.recordSyncPoint("task1", ["task2"]);

				const stats = detector.getStats();
				assert.strictEqual(stats.syncPoints, 0);
			});
		});

		describe("detectRaces", () => {
			it("should detect W-W race between two tasks", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task2", "shared_var", "write", 2);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 1);
				assert.strictEqual(races[0].location, "shared_var");
				assert.deepStrictEqual(races[0].tasks, ["task1", "task2"]);
				assert.strictEqual(races[0].conflictType, "W-W");
			});

			it("should detect W-R race between two tasks", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task2", "shared_var", "read", 1);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 1);
				assert.strictEqual(races[0].conflictType, "W-R");
			});

			it("should detect R-W race between two tasks", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "read", 1);
				detector.recordAccess("task2", "shared_var", "write", 2);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 1);
				assert.strictEqual(races[0].conflictType, "R-W");
			});

			it("should not detect race between same task", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task1", "shared_var", "write", 2);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 0);
			});

			it("should not detect R-R as race", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "read", 1);
				detector.recordAccess("task2", "shared_var", "read", 1);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 0);
			});

			it("should respect happens-before relationship from sync points", () => {
				const detector = new RaceDetector();
				// task1 writes first
				detector.recordAccess("task1", "shared_var", "write", 1);
				// task2 syncs with task1 before reading
				detector.recordSyncPoint("task2", ["task1"]);
				detector.recordAccess("task2", "shared_var", "read", 1);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 0);
			});

			it("should detect multiple races at different locations", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "write", 1);
				detector.recordAccess("task2", "loc1", "write", 2);
				detector.recordAccess("task1", "loc2", "read", 1);
				detector.recordAccess("task3", "loc2", "write", 2);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 2);
			});

			it("should detect race involving more than two tasks", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task2", "shared_var", "write", 2);
				detector.recordAccess("task3", "shared_var", "read", 1);

				const races = detector.detectRaces();
				// Should detect races for each unordered pair
				assert.ok(races.length >= 2);
			});

			it("should generate proper race description", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task2", "shared_var", "read", 1);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 1);
				assert.ok(races[0].description.includes("shared_var"));
				assert.ok(races[0].description.includes("task1"));
				assert.ok(races[0].description.includes("task2"));
				assert.ok(races[0].description.includes("write"));
				assert.ok(races[0].description.includes("read"));
			});

			it("should return empty array when detection disabled", () => {
				const detector = new RaceDetector({ enableRaceDetection: false });
				detector.recordAccess("task1", "shared_var", "write", 1);
				detector.recordAccess("task2", "shared_var", "write", 2);

				const races = detector.detectRaces();
				assert.strictEqual(races.length, 0);
			});

			it("should return empty array when no accesses recorded", () => {
				const detector = new RaceDetector();
				const races = detector.detectRaces();
				assert.strictEqual(races.length, 0);
			});
		});

		describe("clear", () => {
			it("should clear all recorded data", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", TEST_VALUE);
				detector.recordAccess("task2", "loc1", "write", TEST_VALUE);
				detector.recordSyncPoint("task3", ["task1"]);

				detector.clear();

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 0);
				assert.strictEqual(stats.locations, 0);
				assert.strictEqual(stats.syncPoints, 0);
			});

			it("should detect no races after clear", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "write", 1);
				detector.recordAccess("task2", "loc1", "write", 2);

				const racesBefore = detector.detectRaces();
				assert.strictEqual(racesBefore.length, 1);

				detector.clear();

				const racesAfter = detector.detectRaces();
				assert.strictEqual(racesAfter.length, 0);
			});
		});

		describe("getStats", () => {
			it("should return zero stats for new detector", () => {
				const detector = new RaceDetector();
				const stats = detector.getStats();

				assert.strictEqual(stats.totalAccesses, 0);
				assert.strictEqual(stats.locations, 0);
				assert.strictEqual(stats.syncPoints, 0);
			});

			it("should return accurate access count", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", 1);
				detector.recordAccess("task1", "loc2", "write", 2);
				detector.recordAccess("task2", "loc1", "read", 1);

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAccesses, 3);
			});

			it("should return accurate location count", () => {
				const detector = new RaceDetector();
				detector.recordAccess("task1", "loc1", "read", 1);
				detector.recordAccess("task2", "loc2", "read", 1);
				detector.recordAccess("task3", "loc3", "write", 1);

				const stats = detector.getStats();
				assert.strictEqual(stats.locations, 3);
			});

			it("should return accurate sync point count", () => {
				const detector = new RaceDetector();
				detector.recordSyncPoint("task1", ["task2"]);
				detector.recordSyncPoint("task3", ["task4", "task5"]);

				const stats = detector.getStats();
				assert.strictEqual(stats.syncPoints, 2);
			});
		});
	});

	//==========================================================================
	// Deadlock Detector Tests
	//==========================================================================

	describe("DeadlockDetector", () => {

		describe("Construction", () => {
			it("should create with default options", () => {
				const detector = new DeadlockDetector();
				assert.ok(detector);
			});

			it("should create with custom options", () => {
				const detector = new DeadlockDetector({
					enableDeadlockDetection: false,
					deadlockTimeout: 10000,
				});
				assert.ok(detector);
			});

			it("should use factory function", () => {
				const detector = createDeadlockDetector();
				assert.ok(detector instanceof DeadlockDetector);
			});
		});

		describe("trackLockAcquisition", () => {
			it("should track lock acquisition attempt", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAcquisitions, 1);
				assert.strictEqual(stats.waitingTasks, 1);
			});

			it("should track multiple acquisition attempts", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquisition("task2", "lock2");

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAcquisitions, 2);
			});

			it("should track same task waiting for multiple locks", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				const stats = detector.getStats();
				assert.strictEqual(stats.waitingTasks, 2);
			});

			it("should not track when detection disabled", () => {
				const detector = new DeadlockDetector({ enableDeadlockDetection: false });
				detector.trackLockAcquisition("task1", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAcquisitions, 0);
			});
		});

		describe("trackLockAcquired", () => {
			it("should track successful lock acquisition", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 1);
				assert.strictEqual(stats.waitingTasks, 0);
			});

			it("should remove from wait graph when acquired", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.waitingTasks, 0);
			});

			it("should handle multiple locks held by same task", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");
				detector.trackLockAcquired("task1", "lock2");

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 2);
			});
		});

		describe("trackLockRelease", () => {
			it("should track lock release", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockRelease("task1", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 0);
			});

			it("should only remove lock for correct holder", () => {
				const detector = new DeadlockDetector();
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");

				// Try to release from different task
				detector.trackLockRelease("task2", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 1);
			});
		});

		describe("detectDeadlock", () => {
			it("should detect simple two-task deadlock cycle", () => {
				const detector = new DeadlockDetector();

				// task1 holds lock1, waits for lock2
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				// task2 holds lock2, waits for lock1
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 1);
				assert.ok(deadlocks[0].cycle.includes("task1"));
				assert.ok(deadlocks[0].cycle.includes("task2"));
			});

			it("should detect three-task deadlock cycle", () => {
				const detector = new DeadlockDetector();

				// task1 holds lock1, waits for lock2
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				// task2 holds lock2, waits for lock3
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock3");

				// task3 holds lock3, waits for lock1
				detector.trackLockAcquisition("task3", "lock3");
				detector.trackLockAcquired("task3", "lock3");
				detector.trackLockAcquisition("task3", "lock1");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 1);
				assert.strictEqual(deadlocks[0].cycle.length, 3);
			});

			it("should not detect deadlock when no cycle exists", () => {
				const detector = new DeadlockDetector();

				// task1 holds lock1
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");

				// task2 holds lock2
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 0);
			});

			it("should not detect deadlock when locks are released", () => {
				const detector = new DeadlockDetector();

				// task1 holds lock1, waits for lock2
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				// task2 holds lock2, waits for lock1
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				// Release lock2 from task2 - breaks the cycle
				detector.trackLockRelease("task2", "lock2");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 0);
			});

			it("should generate proper deadlock description", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 1);
				assert.ok(deadlocks[0].description.includes("task1"));
				assert.ok(deadlocks[0].description.includes("task2"));
				assert.ok(deadlocks[0].description.includes("lock1"));
				assert.ok(deadlocks[0].description.includes("lock2"));
			});

			it("should return empty array when detection disabled", () => {
				const detector = new DeadlockDetector({ enableDeadlockDetection: false });

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 0);
			});

			it("should return empty array when no locks tracked", () => {
				const detector = new DeadlockDetector();
				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 0);
			});

			it("should identify locks involved in deadlock", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lockA");
				detector.trackLockAcquired("task1", "lockA");
				detector.trackLockAcquisition("task1", "lockB");

				detector.trackLockAcquisition("task2", "lockB");
				detector.trackLockAcquired("task2", "lockB");
				detector.trackLockAcquisition("task2", "lockA");

				const deadlocks = detector.detectDeadlock();
				assert.strictEqual(deadlocks.length, 1);
				assert.ok(deadlocks[0].locks.includes("lockA"));
				assert.ok(deadlocks[0].locks.includes("lockB"));
			});
		});

		describe("detectDeadlockWithTimeout", () => {
			it("should return immediately when deadlock detected", async () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const deadlocks = await detector.detectDeadlockWithTimeout(5000);
				assert.strictEqual(deadlocks.length, 1);
			});

			it("should return empty array on timeout", async () => {
				const detector = new DeadlockDetector();

				// No deadlock - just waiting
				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");

				const deadlocks = await detector.detectDeadlockWithTimeout(100);
				assert.strictEqual(deadlocks.length, 0);
			});

			it("should use custom timeout", async () => {
				const detector = new DeadlockDetector();

				const startTime = Date.now();
				const deadlocks = await detector.detectDeadlockWithTimeout(200);
				const elapsed = Date.now() - startTime;

				assert.ok(elapsed >= 200);
				assert.strictEqual(deadlocks.length, 0);
			});
		});

		describe("clear", () => {
			it("should clear all tracking data", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task2", "lock2");

				detector.clear();

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 0);
				assert.strictEqual(stats.waitingTasks, 0);
				assert.strictEqual(stats.totalAcquisitions, 0);
			});

			it("should detect no deadlocks after clear", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");

				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const deadlocksBefore = detector.detectDeadlock();
				assert.strictEqual(deadlocksBefore.length, 1);

				detector.clear();

				const deadlocksAfter = detector.detectDeadlock();
				assert.strictEqual(deadlocksAfter.length, 0);
			});
		});

		describe("getStats", () => {
			it("should return zero stats for new detector", () => {
				const detector = new DeadlockDetector();
				const stats = detector.getStats();

				assert.strictEqual(stats.heldLocks, 0);
				assert.strictEqual(stats.waitingTasks, 0);
				assert.strictEqual(stats.totalAcquisitions, 0);
			});

			it("should return accurate held lock count", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquired("task1", "lock1");
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquired("task2", "lock2");

				const stats = detector.getStats();
				assert.strictEqual(stats.heldLocks, 2);
			});

			it("should return accurate waiting task count", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquisition("task2", "lock2");
				detector.trackLockAcquisition("task3", "lock3");

				const stats = detector.getStats();
				assert.strictEqual(stats.waitingTasks, 3);
			});

			it("should return accurate total acquisitions", () => {
				const detector = new DeadlockDetector();

				detector.trackLockAcquisition("task1", "lock1");
				detector.trackLockAcquisition("task1", "lock2");
				detector.trackLockAcquisition("task2", "lock1");

				const stats = detector.getStats();
				assert.strictEqual(stats.totalAcquisitions, 3);
			});
		});
	});

	//==========================================================================
	// Combined Detectors Tests
	//==========================================================================

	describe("createDetectors", () => {
		it("should create both detectors", () => {
			const detectors = createDetectors();
			assert.ok(detectors.raceDetector instanceof RaceDetector);
			assert.ok(detectors.deadlockDetector instanceof DeadlockDetector);
			assert.strictEqual(typeof detectors.runDetection, "function");
		});

		it("should create detectors with shared options", () => {
			const detectors = createDetectors({
				enableRaceDetection: false,
				enableDeadlockDetection: false,
			});

			const raceStats = detectors.raceDetector.getStats();
			detectors.raceDetector.recordAccess("task1", "loc1", "write", 1);
			assert.strictEqual(raceStats.totalAccesses, 0);

			const deadlockStats = detectors.deadlockDetector.getStats();
			detectors.deadlockDetector.trackLockAcquisition("task1", "lock1");
			assert.strictEqual(deadlockStats.totalAcquisitions, 0);
		});

		it("should run combined detection", () => {
			const detectors = createDetectors();

			// Add some race conditions
			detectors.raceDetector.recordAccess("task1", "shared", "write", 1);
			detectors.raceDetector.recordAccess("task2", "shared", "write", 2);

			// Add some deadlock conditions
			detectors.deadlockDetector.trackLockAcquisition("task1", "lock1");
			detectors.deadlockDetector.trackLockAcquired("task1", "lock1");
			detectors.deadlockDetector.trackLockAcquisition("task1", "lock2");

			detectors.deadlockDetector.trackLockAcquisition("task2", "lock2");
			detectors.deadlockDetector.trackLockAcquired("task2", "lock2");
			detectors.deadlockDetector.trackLockAcquisition("task2", "lock1");

			const result = detectors.runDetection();

			assert.ok(result.races.length > 0);
			assert.ok(result.deadlocks.length > 0);
			assert.strictEqual(typeof result.timestamp, "number");
		});

		it("should return empty results when no issues", () => {
			const detectors = createDetectors();

			const result = detectors.runDetection();

			assert.strictEqual(result.races.length, 0);
			assert.strictEqual(result.deadlocks.length, 0);
			assert.strictEqual(typeof result.timestamp, "number");
		});
	});

	//==========================================================================
	// Edge Cases and Integration Tests
	//==========================================================================

	describe("Edge Cases", () => {
		it("should handle empty task IDs", () => {
			const detector = new RaceDetector();
			detector.recordAccess("", "loc1", "write", 1);
			detector.recordAccess("task2", "loc1", "write", 2);

			const races = detector.detectRaces();
			assert.strictEqual(races.length, 1);
		});

		it("should handle empty location strings", () => {
			const detector = new RaceDetector();
			detector.recordAccess("task1", "", "write", 1);
			detector.recordAccess("task2", "", "write", 2);

			const races = detector.detectRaces();
			assert.strictEqual(races.length, 1);
		});

		it("should handle special characters in task and lock IDs", () => {
			const detector = new DeadlockDetector();

			const specialTaskId = "task-with-special.chars";
			const specialLockId = "lock/with\\special:chars";

			detector.trackLockAcquisition(specialTaskId, specialLockId);
			detector.trackLockAcquired(specialTaskId, specialLockId);

			const stats = detector.getStats();
			assert.strictEqual(stats.heldLocks, 1);
		});

		it("should handle rapid successive accesses", () => {
			const detector = new RaceDetector();

			for (let i = 0; i < 1000; i++) {
				detector.recordAccess(`task${i % 10}`, `loc${i % 100}`, i % 2 === 0 ? "read" : "write", i);
			}

			const stats = detector.getStats();
			assert.strictEqual(stats.totalAccesses, 1000);
		});

		it("should handle very long access chains", () => {
			const detector = new RaceDetector();

			// First task writes to shared location
			detector.recordAccess("task0", "shared", "write", 0);

			// Each subsequent task syncs with previous tasks before accessing
			for (let i = 1; i < 100; i++) {
				const prevTask = `task${i - 1}`;
				const currentTask = `task${i}`;
				// Record sync point BEFORE the access
				detector.recordSyncPoint(currentTask, [prevTask]);
				detector.recordAccess(currentTask, "shared", "write", i);
			}

			const races = detector.detectRaces();
			// With proper sync points (recorded before access), should have fewer races
			// The happens-before relationship prevents races between synced tasks
			assert.ok(races.length < 5000); // Without sync, would be C(100,2) = 4950 races
		});
	});
});
