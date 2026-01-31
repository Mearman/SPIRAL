// SPIRAL Deadlock Detector
// Deadlock detection for PIR async/parallel execution

import type { DetectionOptions } from "./detectors.js";

//==============================================================================
// Lock Acquisition Tracking
//==============================================================================

/** Represents a lock acquisition event */
interface LockAcquisition {
	taskId: string;
	lockId: string;
	timestamp: number;
	acquired: boolean;
}

/** Deadlock cycle report */
export interface DeadlockCycle {
	cycle: string[];
	locks: string[];
	description: string;
}

/** DFS traversal state for cycle detection */
interface DFSState {
	visited: Set<string>;
	recStack: Set<string>;
	path: string[];
	lockPath: string[];
	cycles: DeadlockCycle[];
}

//==============================================================================
// Deadlock Detector
//==============================================================================

/**
 * DeadlockDetector tracks lock acquisitions across concurrent tasks.
 * Uses wait-for graph analysis to detect circular wait conditions.
 */
export class DeadlockDetector {
	private lockHolders = new Map<string, string>();
	private waitGraph = new Map<string, Set<string>>();
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

	/** Track a lock acquisition attempt */
	trackLockAcquisition(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) return;
		this.recordAcquisitionAttempt(taskId, lockId);
		this.addToWaitGraph(taskId, lockId);
		this.maybeAutoDetect();
	}

	private recordAcquisitionAttempt(taskId: string, lockId: string): void {
		this.acquisitionHistory.push({
			taskId, lockId, timestamp: Date.now(), acquired: false,
		});
	}

	private addToWaitGraph(taskId: string, lockId: string): void {
		getOrCreateSet(this.waitGraph, taskId).add(lockId);
	}

	private maybeAutoDetect(): void {
		if (!this._options.autoDetect) return;
		const deadlocks = this.detectDeadlock();
		if (deadlocks.length > 0) {
			console.warn(`[DeadlockDetector] Detected ${deadlocks.length} potential deadlocks`);
		}
	}

	/** Track a successful lock acquisition */
	trackLockAcquired(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) return;
		this.markAcquisitionComplete(taskId, lockId);
		this.lockHolders.set(lockId, taskId);
		this.removeFromWaitGraph(taskId, lockId);
	}

	private markAcquisitionComplete(taskId: string, lockId: string): void {
		for (let i = this.acquisitionHistory.length - 1; i >= 0; i--) {
			const acq = this.acquisitionHistory[i];
			if (acq?.taskId === taskId && acq.lockId === lockId && !acq.acquired) {
				acq.acquired = true;
				break;
			}
		}
	}

	private removeFromWaitGraph(taskId: string, lockId: string): void {
		const waiting = this.waitGraph.get(taskId);
		if (!waiting) return;
		waiting.delete(lockId);
		if (waiting.size === 0) this.waitGraph.delete(taskId);
	}

	/** Track a lock release */
	trackLockRelease(taskId: string, lockId: string): void {
		if (!this._options.enableDeadlockDetection) return;
		if (this.lockHolders.get(lockId) === taskId) {
			this.lockHolders.delete(lockId);
		}
	}

	/** Detect deadlock cycles using wait-for graph analysis */
	detectDeadlock(): DeadlockCycle[] {
		if (!this._options.enableDeadlockDetection) return [];
		const taskGraph = this.buildTaskDependencyGraph();
		return this.findCyclesInGraph(taskGraph);
	}

	private findCyclesInGraph(taskGraph: Map<string, Set<string>>): DeadlockCycle[] {
		const state: DFSState = {
			visited: new Set(), recStack: new Set(),
			path: [], lockPath: [], cycles: [],
		};
		for (const taskId of taskGraph.keys()) {
			if (!state.visited.has(taskId)) {
				this.detectCyclesDFS(taskId, taskGraph, state);
			}
		}
		return state.cycles;
	}

	private buildTaskDependencyGraph(): Map<string, Set<string>> {
		const lockWaiters = this.buildLockWaitersMap();
		return this.buildEdgesFromWaiters(lockWaiters);
	}

	private buildLockWaitersMap(): Map<string, string[]> {
		const lockWaiters = new Map<string, string[]>();
		for (const [taskId, waitingLocks] of this.waitGraph) {
			for (const lockId of waitingLocks) {
				if (!lockWaiters.has(lockId)) lockWaiters.set(lockId, []);
				lockWaiters.get(lockId)?.push(taskId);
			}
		}
		return lockWaiters;
	}

	private buildEdgesFromWaiters(
		lockWaiters: Map<string, string[]>,
	): Map<string, Set<string>> {
		const taskGraph = new Map<string, Set<string>>();
		for (const [lockId, waiters] of lockWaiters) {
			const holder = this.lockHolders.get(lockId);
			if (!holder) continue;
			for (const waiter of waiters) {
				getOrCreateSet(taskGraph, waiter).add(holder);
			}
		}
		return taskGraph;
	}

	private detectCyclesDFS(
		taskId: string,
		graph: Map<string, Set<string>>,
		state: DFSState,
	): void {
		state.visited.add(taskId);
		state.recStack.add(taskId);
		state.path.push(taskId);
		this.pushWaitingLocks(taskId, state.lockPath);
		this.visitDependencies(taskId, graph, state);
		state.recStack.delete(taskId);
		state.path.pop();
		this.popWaitingLocks(taskId, state.lockPath);
	}

	private pushWaitingLocks(taskId: string, lockPath: string[]): void {
		const locks = this.waitGraph.get(taskId);
		if (locks) for (const id of locks) lockPath.push(id);
	}

	private popWaitingLocks(taskId: string, lockPath: string[]): void {
		const locks = this.waitGraph.get(taskId);
		if (locks) {
			let count = locks.size;
			while (count-- > 0) lockPath.pop();
		}
	}

	private visitDependencies(
		taskId: string,
		graph: Map<string, Set<string>>,
		state: DFSState,
	): void {
		const deps = graph.get(taskId);
		if (!deps) return;
		for (const depId of deps) {
			if (!state.visited.has(depId)) {
				this.detectCyclesDFS(depId, graph, state);
			} else if (state.recStack.has(depId)) {
				this.recordCycle(depId, state);
			}
		}
	}

	private recordCycle(startId: string, state: DFSState): void {
		const cycleStart = state.path.indexOf(startId);
		const cycle = state.path.slice(cycleStart);
		const locks = this.extractLocksForCycle(cycle);
		state.cycles.push({
			cycle, locks,
			description: describeDeadlock(cycle, locks),
		});
	}

	private extractLocksForCycle(cycle: string[]): string[] {
		return cycle.map((task, i) => {
			const nextTask = cycle[(i + 1) % cycle.length] ?? "";
			return this.findLockBetween(task, nextTask);
		}).filter((lock): lock is string => lock !== null);
	}

	private findLockBetween(waiterTask: string, holderTask: string): string | null {
		const waitingLocks = this.waitGraph.get(waiterTask);
		if (!waitingLocks) return null;
		for (const lockId of waitingLocks) {
			if (this.lockHolders.get(lockId) === holderTask) return lockId;
		}
		return null;
	}

	/** Detect deadlock with timeout */
	async detectDeadlockWithTimeout(timeoutMs?: number): Promise<DeadlockCycle[]> {
		const timeout = timeoutMs ?? this._defaultTimeout;
		return new Promise((resolve) => {
			const startTime = Date.now();
			const check = () => {
				if (Date.now() - startTime >= timeout) { resolve([]); return; }
				const dl = this.detectDeadlock();
				if (dl.length > 0) resolve(dl);
				else setTimeout(check, 100);
			};
			check();
		});
	}

	/** Clear all tracking state */
	clear(): void {
		this.lockHolders.clear();
		this.waitGraph.clear();
		this.acquisitionHistory = [];
	}

	/** Get statistics about lock tracking */
	getStats(): { heldLocks: number; waitingTasks: number; totalAcquisitions: number } {
		let waitingTasks = 0;
		for (const w of this.waitGraph.values()) waitingTasks += w.size;
		return {
			heldLocks: this.lockHolders.size,
			waitingTasks,
			totalAcquisitions: this.acquisitionHistory.length,
		};
	}
}

//==============================================================================
// Helpers
//==============================================================================

/** Get or create a Set in a Map */
function getOrCreateSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
	let set = map.get(key);
	if (!set) { set = new Set(); map.set(key, set); }
	return set;
}

/** Generate a human-readable deadlock description */
function describeDeadlock(cycle: string[], locks: string[]): string {
	const parts = cycle.map((task, i) => {
		const lock = locks[i] ?? "?";
		const next = cycle[(i + 1) % cycle.length];
		return `task "${task}" is waiting for lock "${lock}" held by task "${next}"`;
	});
	return "Deadlock detected: " + parts.join(", ") +
		". This circular wait condition will never resolve without intervention.";
}
