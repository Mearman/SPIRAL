// SPIRAL Default Task Scheduler
// Cooperative task scheduling with Promise-based execution

import type { Value } from "./types.ts";
import type { TaskScheduler } from "./scheduler.ts";

interface Task {
	promise: Promise<Value>;
	resolve: (value: Value) => void;
	reject: (error: Error) => void;
	status: "pending" | "completed" | "failed";
	fn?: () => Promise<Value>;
	result?: Value;
}

export class DefaultTaskScheduler implements TaskScheduler {
	private tasks = new Map<string, Task>();
	private _globalSteps = 0;
	private readonly globalMaxSteps: number;
	private readonly _yieldInterval: number;
	private _currentTaskId = "main";

	constructor(
		options: {
			globalMaxSteps?: number;
			yieldInterval?: number;
		} = {},
	) {
		this.globalMaxSteps = options.globalMaxSteps ?? 1_000_000;
		this._yieldInterval = options.yieldInterval ?? 100;
	}

	get currentTaskId(): string {
		return this._currentTaskId;
	}

	set currentTaskId(taskId: string) {
		this._currentTaskId = taskId;
	}

	get activeTaskCount(): number {
		return this.tasks.size;
	}

	get globalSteps(): number {
		return this._globalSteps;
	}

	spawn(taskId: string, fn: () => Promise<Value>): void {
		let taskResolve: (value: Value) => void = () => {};
		let taskReject: (error: Error) => void = () => {};

		const promise = new Promise<Value>((resolve, reject) => {
			taskResolve = resolve;
			taskReject = reject;
		});

		const task: Task = {
			promise,
			resolve: taskResolve,
			reject: taskReject,
			status: "pending",
			fn,
		};

		this.tasks.set(taskId, task);

		// Eagerly start the task to avoid deadlocks
		fn()
			.then((result) => {
				task.status = "completed";
				task.result = result;
				task.resolve(result);
			})
			.catch((error) => {
				task.status = "failed";
				task.reject(error);
			});
	}

	async await(taskId: string): Promise<Value> {
		const task = this.tasks.get(taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found`);
		}
		if (task.status === "completed" && task.result !== undefined) {
			return task.result;
		}
		return task.promise;
	}

	async checkGlobalSteps(): Promise<void> {
		if (++this._globalSteps > this.globalMaxSteps) {
			throw new Error("Global step limit exceeded");
		}
		if (this._globalSteps % this._yieldInterval === 0) {
			await Promise.resolve();
		}
	}

	cancel(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (!task) {
			return;
		}
		task.status = "failed";
		this.tasks.delete(taskId);
	}

	isComplete(taskId: string): boolean {
		const task = this.tasks.get(taskId);
		if (!task) {
			return true;
		}
		return task.status === "completed" || task.status === "failed";
	}
}
