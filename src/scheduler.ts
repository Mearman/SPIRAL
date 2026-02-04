// SPIRAL Task Scheduler
// Cooperative task scheduling for async/parallel execution

import type { Value } from "./types.ts";
import { DefaultTaskScheduler } from "./default-scheduler.ts";

export { DefaultTaskScheduler } from "./default-scheduler.ts";
export { AsyncBarrier } from "./async-barrier.ts";

//==============================================================================
// Task Scheduler Interface
//==============================================================================

/**
 * TaskScheduler manages async task execution in EIR async
 * Uses cooperative scheduling with Promise-based execution
 */
export interface TaskScheduler {
	/** Spawn a new async task */
	spawn(taskId: string, fn: () => Promise<Value>): void;
	/** Await a task's completion */
	await(taskId: string): Promise<Value>;
	/** Get the current task ID */
	readonly currentTaskId: string;
	/** Check global step limit and yield if needed */
	checkGlobalSteps(): Promise<void>;
	/** Get the number of active tasks */
	readonly activeTaskCount: number;
	/** Get the global step counter */
	readonly globalSteps: number;
	/** Cancel a running task */
	cancel(taskId: string): void;
	/** Check if a task is complete */
	isComplete(taskId: string): boolean;
}

//==============================================================================
// Deterministic Scheduler (for testing)
//==============================================================================

export type SchedulerMode = "sequential" | "parallel" | "breadth-first" | "depth-first";

interface QueuedTask {
	id: string;
	fn: () => Promise<Value>;
	resolve: (value: Value) => void;
	reject: (error: Error) => void;
}

/** Execute a queued task and store its result */
async function executeQueuedTask(
	task: QueuedTask,
	completedTasks: Map<string, Value>,
): Promise<void> {
	try {
		const result = await task.fn();
		completedTasks.set(task.id, result);
		task.resolve(result);
	} catch (error) {
		task.reject(error instanceof Error ? error : new Error(String(error)));
	}
}

/** Retrieve a completed task result or throw */
function getCompletedResult(taskId: string, completedTasks: Map<string, Value>): Value {
	const result = completedTasks.get(taskId);
	if (!result) {
		throw new Error(`Task ${taskId} not found in completed tasks`);
	}
	return result;
}

/**
 * Poll until a task completes or the scheduler is disposed.
 */
async function pollUntilComplete(
	taskId: string,
	completedTasks: Map<string, Value>,
	isDisposed: () => boolean,
): Promise<void> {
	while (!completedTasks.has(taskId)) {
		if (isDisposed()) {
			throw new Error(`Task ${taskId} not found (scheduler disposed)`);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

export class DeterministicScheduler implements TaskScheduler {
	private taskQueue: QueuedTask[] = [];
	private completedTasks = new Map<string, Value>();
	private _globalSteps = 0;
	private readonly globalMaxSteps: number;
	private _currentTaskId = "main";
	private mode: SchedulerMode;
	private currentTaskRunning = false;
	private breadthFirstRunning = false;
	private depthFirstRunning = false;
	private _disposed = false;

	constructor(
		mode: SchedulerMode = "parallel",
		options: { globalMaxSteps?: number } = {},
	) {
		this.mode = mode;
		this.globalMaxSteps = options.globalMaxSteps ?? 1_000_000;
	}

	get currentTaskId(): string {
		return this._currentTaskId;
	}

	set currentTaskId(taskId: string) {
		this._currentTaskId = taskId;
	}

	get activeTaskCount(): number {
		return this.taskQueue.length;
	}

	get globalSteps(): number {
		return this._globalSteps;
	}

	setMode(mode: SchedulerMode): void {
		this.mode = mode;
	}

	getMode(): SchedulerMode {
		return this.mode;
	}

	/** Dispose of the scheduler and stop all pending polling loops. */
	dispose(): void {
		this._disposed = true;
	}

	spawn(taskId: string, fn: () => Promise<Value>): void {
		let taskResolve: (value: Value) => void = () => {};
		let taskReject: (error: Error) => void = () => {};

		void new Promise<Value>((resolve, reject) => {
			taskResolve = resolve;
			taskReject = reject;
		});

		this.taskQueue.push({ id: taskId, fn, resolve: taskResolve, reject: taskReject });
		this.startModeExecution();
	}

	async await(taskId: string): Promise<Value> {
		if (this.completedTasks.has(taskId)) {
			return getCompletedResult(taskId, this.completedTasks);
		}
		if (this.mode === "parallel") {
			await this.awaitParallel(taskId);
		} else {
			await pollUntilComplete(taskId, this.completedTasks, () => this._disposed);
		}
		return getCompletedResult(taskId, this.completedTasks);
	}

	async checkGlobalSteps(): Promise<void> {
		if (++this._globalSteps > this.globalMaxSteps) {
			throw new Error("Global step limit exceeded");
		}
		await Promise.resolve();
	}

	cancel(taskId: string): void {
		const taskIndex = this.taskQueue.findIndex((t) => t.id === taskId);
		if (taskIndex !== -1) {
			this.taskQueue.splice(taskIndex, 1);
		}
	}

	isComplete(taskId: string): boolean {
		return this.completedTasks.has(taskId);
	}

	/** Trigger background execution based on the current scheduling mode */
	private startModeExecution(): void {
		if (this.mode === "sequential" && !this.currentTaskRunning) {
			this.runNextTask().catch(() => {});
		} else if (this.mode === "breadth-first" && !this.breadthFirstRunning) {
			this.runBreadthFirst().catch(() => {});
		} else if (this.mode === "depth-first" && !this.depthFirstRunning) {
			this.runDepthFirst().catch(() => {});
		}
	}

	/** Execute the awaited task in parallel mode, polling if another await owns it */
	private async awaitParallel(taskId: string): Promise<void> {
		while (!this.completedTasks.has(taskId)) {
			const taskIndex = this.taskQueue.findIndex((t) => t.id === taskId);
			if (taskIndex !== -1) {
				await this.executeFromQueue(taskId, taskIndex);
				return;
			}
			await pollUntilComplete(taskId, this.completedTasks, () => this._disposed);
		}
	}

	/** Remove a task from the queue by index and execute it directly */
	private async executeFromQueue(taskId: string, taskIndex: number): Promise<void> {
		const task = this.taskQueue[taskIndex];
		if (!task) {
			throw new Error(`Task at index ${taskIndex} not found in queue`);
		}
		this.taskQueue.splice(taskIndex, 1);
		this._currentTaskId = taskId;
		try {
			const result = await task.fn();
			this.completedTasks.set(taskId, result);
		} finally {
			this._currentTaskId = "main";
		}
	}

	private async runNextTask(): Promise<void> {
		const task = this.dequeueNextTask();
		if (!task) {
			return;
		}
		this._currentTaskId = task.id;
		await executeQueuedTask(task, this.completedTasks);
		if (this.taskQueue.length > 0) {
			await this.runNextTask();
		} else {
			this.currentTaskRunning = false;
		}
	}

	/** Dequeue the next task for sequential execution, managing the running flag */
	private dequeueNextTask(): QueuedTask | undefined {
		if (this.taskQueue.length === 0) {
			this.currentTaskRunning = false;
			return undefined;
		}
		this.currentTaskRunning = true;
		return this.taskQueue.shift();
	}

	/** Execute all tasks in the queue in parallel batches (breadth-first) */
	private async runBreadthFirst(): Promise<void> {
		if (this.taskQueue.length === 0) {
			this.breadthFirstRunning = false;
			return;
		}
		this.breadthFirstRunning = true;
		await this.executeBatch();
		if (this.taskQueue.length > 0) {
			await this.runBreadthFirst();
		} else {
			this._globalSteps = 0;
			this.breadthFirstRunning = false;
		}
	}

	/** Snapshot the current queue and execute all tasks in parallel */
	private async executeBatch(): Promise<void> {
		const currentBatch = [...this.taskQueue];
		this.taskQueue = [];
		await Promise.all(
			currentBatch.map(async (task) => {
				this._currentTaskId = task.id;
				await executeQueuedTask(task, this.completedTasks);
			}),
		);
	}

	/** Execute tasks depth-first (LIFO - last spawned, first executed) */
	private async runDepthFirst(): Promise<void> {
		this.depthFirstRunning = true;
		try {
			await this.processDepthFirstQueue();
			if (this.taskQueue.length > 0) {
				await this.runDepthFirst();
			}
		} finally {
			if (this.taskQueue.length === 0) {
				this.depthFirstRunning = false;
			}
		}
	}

	/** Process all current tasks in LIFO order */
	private async processDepthFirstQueue(): Promise<void> {
		while (this.taskQueue.length > 0) {
			const task = this.taskQueue.pop();
			if (!task) {
				throw new Error("No task available in queue");
			}
			this._currentTaskId = task.id;
			await executeQueuedTask(task, this.completedTasks);
		}
	}
}

//==============================================================================
// Factory Functions
//==============================================================================

/** Create a default task scheduler */
export function createTaskScheduler(options?: {
	globalMaxSteps?: number;
	yieldInterval?: number;
}): TaskScheduler {
	return new DefaultTaskScheduler(options);
}

/** Create a deterministic scheduler for testing */
export function createDeterministicScheduler(
	mode: SchedulerMode = "parallel",
	options?: { globalMaxSteps?: number },
): TaskScheduler {
	return new DeterministicScheduler(mode, options);
}
