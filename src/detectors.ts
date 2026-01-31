// SPIRAL Concurrent Execution Detectors
// Race condition and deadlock detection for PIR async/parallel execution

import type { Value } from "./types.js";
import { DeadlockDetector } from "./deadlock-detector.js";
export { DeadlockDetector } from "./deadlock-detector.js";
export type { DeadlockCycle } from "./deadlock-detector.js";

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
 * Context for recording a memory access
 */
interface RecordAccessContext {
	taskId: string;
	location: string;
	type: "read" | "write";
	value: Value;
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
	 * @param args - Tuple of [taskId, location, type, value]
	 */
	recordAccess(
		...args: [string, string, "read" | "write", Value]
	): void {
		const [taskId, location, type, value] = args;
		this.recordAccessFromContext({ taskId, location, type, value });
	}

	private recordAccessFromContext(ctx: RecordAccessContext): void {
		if (!this._options.enableRaceDetection) return;
		const access = this.buildAccess(ctx);
		this.storeAccess(access);
		this.maybeAutoDetectRaces();
	}

	private buildAccess(ctx: RecordAccessContext): MemoryAccess {
		const previousSyncs = this.syncPoints.get(ctx.taskId);
		return {
			...ctx,
			timestamp: Date.now(),
			happensBefore: previousSyncs ? new Set(previousSyncs) : new Set(),
		};
	}

	private storeAccess(access: MemoryAccess): void {
		if (!this.accesses.has(access.location)) {
			this.accesses.set(access.location, []);
		}
		this.accesses.get(access.location)?.push(access);
		this.accessCounter++;
	}

	private maybeAutoDetectRaces(): void {
		if (!this._options.autoDetect || this.accessCounter % 100 !== 0) return;
		const races = this.detectRaces();
		if (races.length > 0) {
			console.warn(`[RaceDetector] Detected ${races.length} potential race conditions`);
		}
	}

	/**
	 * Record a synchronization point (e.g., join, barrier)
	 * Creates happens-before edges from all tasks that completed
	 * @param taskId - Task performing the synchronization
	 * @param syncTaskIds - Tasks being synchronized with
	 */
	recordSyncPoint(taskId: string, syncTaskIds: string[]): void {
		if (!this._options.enableRaceDetection) return;
		const syncSet = getOrCreateSet(this.syncPoints, taskId);
		for (const id of syncTaskIds) syncSet.add(id);
	}

	/**
	 * Detect data races across all recorded accesses
	 * @returns Array of detected race conditions
	 */
	detectRaces(): RaceCondition[] {
		if (!this._options.enableRaceDetection) return [];
		const races: RaceCondition[] = [];
		for (const [location, accesses] of this.accesses) {
			this.detectRacesAtLocation(location, accesses, races);
		}
		return races;
	}

	private detectRacesAtLocation(
		location: string,
		accesses: MemoryAccess[],
		races: RaceCondition[],
	): void {
		for (let i = 0; i < accesses.length; i++) {
			for (let j = i + 1; j < accesses.length; j++) {
				const a1 = accesses[i];
				const a2 = accesses[j];
				if (!a1 || !a2) continue;
				const race = this.checkPairForRace(location, a1, a2);
				if (race) races.push(race);
			}
		}
	}

	/**
	 * Check if two accesses form a race condition
	 */
	private checkPairForRace(
		location: string,
		a1: MemoryAccess,
		a2: MemoryAccess,
	): RaceCondition | null {
		if (a1.taskId === a2.taskId) return null;
		if (this.hasHappensBefore(a1, a2)) return null;
		const conflictType = getConflictType(a1.type, a2.type);
		if (conflictType === null) return null;
		return {
			location,
			tasks: [a1.taskId, a2.taskId],
			accessTypes: [a1.type, a2.type],
			conflictType,
			description: describeRace(location, a1, a2),
		};
	}

	/**
	 * Check if there's a happens-before relationship between two accesses
	 */
	private hasHappensBefore(a1: MemoryAccess, a2: MemoryAccess): boolean {
		if (a2.happensBefore.has(a1.taskId)) return true;
		if (a1.happensBefore.has(a2.taskId)) return true;
		for (const id of a1.happensBefore) {
			if (a2.happensBefore.has(id)) return true;
		}
		return false;
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
		for (const a of this.accesses.values()) totalAccesses += a.length;
		return {
			totalAccesses,
			locations: this.accesses.size,
			syncPoints: this.syncPoints.size,
		};
	}
}

//==============================================================================
// Shared Helpers
//==============================================================================

/**
 * Get or create a Set in a Map
 */
function getOrCreateSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
	let set = map.get(key);
	if (!set) {
		set = new Set();
		map.set(key, set);
	}
	return set;
}

/**
 * Get the conflict type between two accesses
 * Returns null if no conflict (R-R)
 */
function getConflictType(
	t1: "read" | "write",
	t2: "read" | "write",
): "W-W" | "W-R" | "R-W" | null {
	if (t1 === "write" && t2 === "write") return "W-W";
	if (t1 === "write" && t2 === "read") return "W-R";
	if (t1 === "read" && t2 === "write") return "R-W";
	return null;
}

/**
 * Generate a human-readable race description
 */
function describeRace(location: string, a1: MemoryAccess, a2: MemoryAccess): string {
	return (
		`Potential data race at location "${location}": ` +
		`task "${a1.taskId}" performs ${a1.type} and task "${a2.taskId}" performs ${a2.type} ` +
		"without happens-before ordering. This could lead to undefined behavior."
	);
}

//==============================================================================
// Detection Result
//==============================================================================

/**
 * Combined detection result
 */
export interface DetectionResult {
	races: RaceCondition[];
	deadlocks: import("./deadlock-detector.js").DeadlockCycle[];
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
