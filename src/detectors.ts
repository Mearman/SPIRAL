// SPIRAL Concurrent Execution Detectors
// Race condition and deadlock detection for PIR async/parallel execution

import type { Value } from "./types.js";

//==============================================================================
// Detection Options
//==============================================================================

/**
 * Configuration options for race and deadlock detectors
 */
export interface DetectionOptions {
	/**
	 * Enable race detection
	 */
	enableRaceDetection?: boolean;

	/**
	 * Enable deadlock detection
	 */
	enableDeadlockDetection?: boolean;

	/**
	 * Maximum time to wait for deadlock detection (ms)
	 */
	deadlockTimeout?: number;

	/**
	 * Include access patterns in race reports
	 */
	detailedRaceReports?: boolean;

	/**
	 * Auto-detect on every evaluation cycle
	 */
	autoDetect?: boolean;
}

//==============================================================================
// Memory Access Tracking
//==============================================================================

/**
 * Represents a single memory access event
 */
interface MemoryAccess {
	taskId: string;
	location: string;
	type: "read" | "write";
	value: Value;
	timestamp: number;
	happensBefore: Set<string>; // Task IDs that must happen before this access
}

/**
 * Race condition report
 */
export interface RaceCondition {
	location: string;
	tasks: [string, string];
	accessTypes: ["read" | "write", "read" | "write"];
	conflictType: "W-W" | "W-R" | "R-W";
	description: string;
}

//==============================================================================
// Lock Acquisition Tracking
//==============================================================================

/**
 * Represents a lock acquisition event
 */
interface LockAcquisition {
	taskId: string;
	lockId: string;
	timestamp: number;
	acquired: boolean;
}

/**
 * Deadlock cycle report
 */
export interface DeadlockCycle {
	cycle: string[];
	locks: string[];
	description: string;
}

//==============================================================================
// Race Detector
//==============================================================================

/**
 * RaceDetector tracks memory accesses across concurrent tasks
 * Uses happens-before analysis to detect data races
 *
 * A data race occurs when:
 * 1. Two or more tasks access the same memory location
 * 2. At least one access is a write
 * 3. No happens-before ordering exists between the accesses
 */
export class RaceDetector {
	private accesses = new Map<string, MemoryAccess[]>();
	private syncPoints = new Map<string, Set<string>>();
	private readonly _options: DetectionOptions;
	private accessCounter = 0;

	constructor(options: DetectionOptions = {}) {
		this._options = {
			enableRaceDetection: true,
			detailedRaceReports: true,
			...options,
		};
	}

	/**
	 * Record a memory access from a task
	 * @param taskId - Task performing the access
	 * @param location - Memory location being accessed
	 * @param type - Access type (read or write)
	 * @param value - Value being read or written
	 */
	recordAccess(taskId: string, location: string, type: "read" | "write", value: Value): void {
		if (!this._options.enableRaceDetection) {
			return;
		}

		const access: MemoryAccess = {
			taskId,
			location,
			type,
			value,
			timestamp: Date.now(),
			happensBefore: new Set(),
		};

		// Establish happens-before from previous sync points
		const previousSyncs = this.syncPoints.get(taskId);
		if (previousSyncs) {
			access.happensBefore = new Set(previousSyncs);
		}

		// Store access
		if (!this.accesses.has(location)) {
			this.accesses.set(location, []);
		}
		this.accesses.get(location)?.push(access);
		this.accessCounter++;

		// Auto-detect if enabled
		if (this._options.autoDetect && this.accessCounter % 100 === 0) {
			const races = this.detectRaces();
			if (races.length > 0) {
				console.warn(`[RaceDetector] Detected ${races.length} potential race conditions`);
			}
		}
	}

	/**
	 * Record a synchronization point (e.g., join, barrier)
	 * Creates happens-before edges from all tasks that completed
	 * @param taskId - Task performing the synchronization
	 * @param syncTaskIds - Tasks being synchronized with
	 */
	recordSyncPoint(taskId: string, syncTaskIds: string[]): void {
		if (!this._options.enableRaceDetection) {
			return;
		}

		// Record that taskId happens-after all syncTaskIds
		let syncSet = this.syncPoints.get(taskId);
		if (!syncSet) {
			syncSet = new Set();
			this.syncPoints.set(taskId, syncSet);
		}

		for (const syncTaskId of syncTaskIds) {
			syncSet.add(syncTaskId);
		}
	}

	/**
	 * Detect data races across all recorded accesses
	 * @returns Array of detected race conditions
	 */
	detectRaces(): RaceCondition[] {
		if (!this._options.enableRaceDetection) {
			return [];
		}

		const races: RaceCondition[] = [];

		for (const [location, accesses] of this.accesses) {
			// Check all pairs of accesses for potential races
			for (let i = 0; i < accesses.length; i++) {
				for (let j = i + 1; j < accesses.length; j++) {
					const access1 = accesses[i];
					const access2 = accesses[j];

					if (!access1 || !access2) continue;

					const race = this.checkPairForRace(location, access1, access2);
					if (race) {
						races.push(race);
					}
				}
			}
		}

		return races;
	}

	/**
	 * Check if two accesses form a race condition
	 */
	private checkPairForRace(
		location: string,
		access1: MemoryAccess,
		access2: MemoryAccess,
	): RaceCondition | null {
		// Same task - not a race
		if (access1.taskId === access2.taskId) {
			return null;
		}

		// Check if there's a happens-before relationship
		if (this.hasHappensBefore(access1, access2)) {
			return null;
		}

		// Determine conflict type
		const conflictType = this.getConflictType(access1, access2);

		// Only W-W, W-R, and R-W are races
		if (conflictType === null) {
			return null;
		}

		const description = this.generateRaceDescription(
			location,
			access1.taskId,
			access2.taskId,
			access1.type,
			access2.type,
		);

		return {
			location,
			tasks: [access1.taskId, access2.taskId],
			accessTypes: [access1.type, access2.type],
			conflictType,
			description,
		};
	}

	/**
	 * Check if there's a happens-before relationship between two accesses
	 */
	private hasHappensBefore(access1: MemoryAccess, access2: MemoryAccess): boolean {
		// Check if access1 happens-before access2
		if (access2.happensBefore.has(access1.taskId)) {
			return true;
		}

		// Check if access2 happens-before access1
		if (access1.happensBefore.has(access2.taskId)) {
			return true;
		}

		// Check transitive happens-before
		for (const ancestorId of access1.happensBefore) {
			if (access2.happensBefore.has(ancestorId)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get the conflict type between two accesses
	 * Returns null if no conflict (R-R)
	 */
	private getConflictType(
		access1: MemoryAccess,
		access2: MemoryAccess,
	): "W-W" | "W-R" | "R-W" | null {
		if (access1.type === "write" && access2.type === "write") {
			return "W-W";
		}
		if (access1.type === "write" && access2.type === "read") {
			return "W-R";
		}
		if (access1.type === "read" && access2.type === "write") {
			return "R-W";
		}
		// R-R is not a race
		return null;
	}

	/**
	 * Generate a human-readable race description
	 */
	private generateRaceDescription(
		location: string,
		task1: string,
		task2: string,
		type1: "read" | "write",
		type2: "read" | "write",
	): string {
		return `Potential data race at location "${location}": ` +
			`task "${task1}" performs ${type1} and task "${task2}" performs ${type2} ` +
			"without happens-before ordering. This could lead to undefined behavior.";
	}

	/**
	 * Clear all recorded accesses and sync points
	 */
	clear(): void {
		this.accesses.clear();
		this.syncPoints.clear();
		this.accessCounter = 0;
	}

	/**
	 * Get statistics about recorded accesses
	 */
	getStats(): {
		totalAccesses: number;
		locations: number;
		syncPoints: number;
		} {
		let totalAccesses = 0;
		for (const accesses of this.accesses.values()) {
			totalAccesses += accesses.length;
		}

		return {
			totalAccesses,
			locations: this.accesses.size,
			syncPoints: this.syncPoints.size,
		};
	}
}

//==============================================================================
// Deadlock Detector
//==============================================================================

/**
 * DeadlockDetector tracks lock acquisitions across concurrent tasks
 * Uses wait-for graph analysis to detect circular wait conditions
 *
 * A deadlock occurs when:
 * 1. A cycle exists in the wait-for graph
 * 2. All tasks in the cycle are blocked waiting for locks
 * 3. The cycle has no external resolver
 */
export class DeadlockDetector {
	private lockHolders = new Map<string, string>(); // lockId -> taskId
	private waitGraph = new Map<string, Set<string>>(); // taskId -> Set of lockIds waiting for
	private acquisitionHistory: LockAcquisition[] = [];
	private readonly _options: DetectionOptions;
	private readonly _defaultTimeout: number;

	constructor(options: DetectionOptions = {}) {
		this._options = {
			enableDeadlockDetection: true,
			deadlockTimeout: 5000,
			...options,
		};
		this._defaultTimeout = this._options.deadlockTimeout ?? 5000;
	}

	/**
	 * Track a lock acquisition attempt
	 * @param taskId - Task attempting to acquire the lock
	 * @param lockId - Lock being acquired
	 */
	trackLockAcquisition(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) {
			return;
		}

		const acquisition: LockAcquisition = {
			taskId,
			lockId,
			timestamp: Date.now(),
			acquired: false, // Initially not acquired
		};

		this.acquisitionHistory.push(acquisition);

		// Record that task is waiting for lock
		let waitingFor = this.waitGraph.get(taskId);
		if (!waitingFor) {
			waitingFor = new Set();
			this.waitGraph.set(taskId, waitingFor);
		}
		waitingFor.add(lockId);

		// Auto-detect if enabled
		if (this._options.autoDetect) {
			const deadlocks = this.detectDeadlock();
			if (deadlocks.length > 0) {
				console.warn(`[DeadlockDetector] Detected ${deadlocks.length} potential deadlocks`);
			}
		}
	}

	/**
	 * Track a successful lock acquisition
	 * @param taskId - Task that acquired the lock
	 * @param lockId - Lock that was acquired
	 */
	trackLockAcquired(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) {
			return;
		}

		// Update the most recent acquisition for this task/lock
		for (let i = this.acquisitionHistory.length - 1; i >= 0; i--) {
			const acquisition = this.acquisitionHistory[i];
			if (acquisition?.taskId === taskId && acquisition.lockId === lockId && !acquisition.acquired) {
				acquisition.acquired = true;
				break;
			}
		}

		// Record that task now holds the lock
		this.lockHolders.set(lockId, taskId);

		// Remove from wait graph
		const waitingFor = this.waitGraph.get(taskId);
		if (waitingFor) {
			waitingFor.delete(lockId);
			if (waitingFor.size === 0) {
				this.waitGraph.delete(taskId);
			}
		}
	}

	/**
	 * Track a lock release
	 * @param taskId - Task releasing the lock
	 * @param lockId - Lock being released
	 */
	trackLockRelease(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) {
			return;
		}

		// Remove from lock holders
		if (this.lockHolders.get(lockId) === taskId) {
			this.lockHolders.delete(lockId);
		}
	}

	/**
	 * Detect deadlock cycles using wait-for graph analysis
	 * @returns Array of detected deadlock cycles
	 */
	detectDeadlock(): DeadlockCycle[] {
		if (!this._options.enableDeadlockDetection) {
			return [];
		}

		const cycles: DeadlockCycle[] = [];
		const visited = new Set<string>();
		const recStack = new Set<string>();
		const path: string[] = [];
		const lockPath: string[] = [];

		// Build task dependency graph: task -> tasks it's waiting for
		const taskGraph = this.buildTaskDependencyGraph();

		// DFS to detect cycles
		for (const taskId of taskGraph.keys()) {
			if (!visited.has(taskId)) {
				this.detectCyclesDFS(
					taskId,
					taskGraph,
					visited,
					recStack,
					path,
					lockPath,
					cycles,
				);
			}
		}

		return cycles;
	}

	/**
	 * Build a task dependency graph from lock holders and waiters
	 * Returns: Map<taskId, Set<taskId>> where edges represent waiting relationships
	 */
	private buildTaskDependencyGraph(): Map<string, Set<string>> {
		const taskGraph = new Map<string, Set<string>>();

		// For each lock, find who holds it and who's waiting for it
		const lockWaiters = new Map<string, string[]>();

		// Build map of lock -> tasks waiting for it
		for (const [taskId, waitingLocks] of this.waitGraph) {
			for (const lockId of waitingLocks) {
				if (!lockWaiters.has(lockId)) {
					lockWaiters.set(lockId, []);
				}
				lockWaiters.get(lockId)?.push(taskId);
			}
		}

		// Create edges: waiting task -> holding task
		for (const [lockId, waiters] of lockWaiters) {
			const holder = this.lockHolders.get(lockId);
			if (holder) {
				for (const waiter of waiters) {
					let dependencies = taskGraph.get(waiter);
					if (!dependencies) {
						dependencies = new Set();
						taskGraph.set(waiter, dependencies);
					}
					dependencies.add(holder);
				}
			}
		}

		return taskGraph;
	}

	/**
	 * DFS-based cycle detection in task dependency graph
	 */
	private detectCyclesDFS(
		taskId: string,
		graph: Map<string, Set<string>>,
		visited: Set<string>,
		recStack: Set<string>,
		path: string[],
		lockPath: string[],
		cycles: DeadlockCycle[],
	): void {
		visited.add(taskId);
		recStack.add(taskId);
		path.push(taskId);

		// Add locks this task is waiting for
		const waitingLocks = this.waitGraph.get(taskId);
		if (waitingLocks) {
			for (const lockId of waitingLocks) {
				lockPath.push(lockId);
			}
		}

		const dependencies = graph.get(taskId);
		if (dependencies) {
			for (const depId of dependencies) {
				if (!visited.has(depId)) {
					this.detectCyclesDFS(
						depId,
						graph,
						visited,
						recStack,
						path,
						lockPath,
						cycles,
					);
				} else if (recStack.has(depId)) {
					// Found a cycle - extract it
					const cycleStart = path.indexOf(depId);
					const cycle = path.slice(cycleStart);
					const locks = this.extractLocksForCycle(cycle);

					cycles.push({
						cycle,
						locks,
						description: this.generateDeadlockDescription(cycle, locks),
					});
				}
			}
		}

		recStack.delete(taskId);
		path.pop();

		// Remove locks this task was waiting for
		if (waitingLocks) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for (const __ of waitingLocks) {
				lockPath.pop();
			}
		}
	}

	/**
	 * Extract locks involved in a deadlock cycle
	 */
	private extractLocksForCycle(cycle: string[]): string[] {
		const locks: string[] = [];

		for (let i = 0; i < cycle.length; i++) {
			const currentTask = cycle[i] ?? "";
			const nextTask = cycle[(i + 1) % cycle.length] ?? "";

			// Find the lock that currentTask is waiting for that nextTask holds
			const waitingLocks = this.waitGraph.get(currentTask);
			if (waitingLocks) {
				for (const lockId of waitingLocks) {
					const holder = this.lockHolders.get(lockId);
					if (holder && holder === nextTask) {
						locks.push(lockId);
						break;
					}
				}
			}
		}

		return locks;
	}

	/**
	 * Generate a human-readable deadlock description
	 */
	private generateDeadlockDescription(cycle: string[], locks: string[]): string {
		let description = "Deadlock detected: ";

		for (let i = 0; i < cycle.length; i++) {
			const task = cycle[i];
			const lock = locks[i] ?? "?";
			const nextTask = cycle[(i + 1) % cycle.length];

			description += `task "${task}" is waiting for lock "${lock}" held by task "${nextTask}"`;

			if (i < cycle.length - 1) {
				description += ", ";
			}
		}

		description += ". This circular wait condition will never resolve without intervention.";

		return description;
	}

	/**
	 * Detect deadlock with timeout
	 * Returns as soon as a deadlock is detected or timeout expires
	 */
	async detectDeadlockWithTimeout(timeoutMs?: number): Promise<DeadlockCycle[]> {
		const timeout = timeoutMs ?? this._defaultTimeout;

		return new Promise((resolve) => {
			const startTime = Date.now();

			const checkDeadline = () => {
				if (Date.now() - startTime >= timeout) {
					resolve([]);
					return;
				}

				const deadlocks = this.detectDeadlock();
				if (deadlocks.length > 0) {
					resolve(deadlocks);
				} else {
					setTimeout(checkDeadline, 100);
				}
			};

			checkDeadline();
		});
	}

	/**
	 * Clear all tracking state
	 */
	clear(): void {
		this.lockHolders.clear();
		this.waitGraph.clear();
		this.acquisitionHistory = [];
	}

	/**
	 * Get statistics about lock tracking
	 */
	getStats(): {
		heldLocks: number;
		waitingTasks: number;
		totalAcquisitions: number;
		} {
		let waitingTasks = 0;
		for (const waiters of this.waitGraph.values()) {
			waitingTasks += waiters.size;
		}

		return {
			heldLocks: this.lockHolders.size,
			waitingTasks,
			totalAcquisitions: this.acquisitionHistory.length,
		};
	}
}

//==============================================================================
// Detection Result
//==============================================================================

/**
 * Combined detection result
 */
export interface DetectionResult {
	races: RaceCondition[];
	deadlocks: DeadlockCycle[];
	timestamp: number;
}

//==============================================================================
// Factory Functions
//==============================================================================

/**
 * Create a race detector with the given options
 */
export function createRaceDetector(options?: DetectionOptions): RaceDetector {
	return new RaceDetector(options);
}

/**
 * Create a deadlock detector with the given options
 */
export function createDeadlockDetector(options?: DetectionOptions): DeadlockDetector {
	return new DeadlockDetector(options);
}

/**
 * Create both detectors with shared options
 */
export function createDetectors(options?: DetectionOptions): {
	raceDetector: RaceDetector;
	deadlockDetector: DeadlockDetector;
	runDetection: () => DetectionResult;
} {
	const raceDetector = new RaceDetector(options);
	const deadlockDetector = new DeadlockDetector(options);

	const runDetection = (): DetectionResult => ({
		races: raceDetector.detectRaces(),
		deadlocks: deadlockDetector.detectDeadlock(),
		timestamp: Date.now(),
	});

	return {
		raceDetector,
		deadlockDetector,
		runDetection,
	};
}

/**
 * Default detection options for development
 */
export const DEFAULT_DETECTION_OPTIONS: DetectionOptions = {
	enableRaceDetection: true,
	enableDeadlockDetection: true,
	deadlockTimeout: 5000,
	detailedRaceReports: true,
	autoDetect: false, // Disabled by default for performance
};

/**
 * Strict detection options for testing/debugging
 */
export const STRICT_DETECTION_OPTIONS: DetectionOptions = {
	enableRaceDetection: true,
	enableDeadlockDetection: true,
	deadlockTimeout: 1000,
	detailedRaceReports: true,
	autoDetect: true, // Auto-detect on every access
};
