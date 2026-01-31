 
 

// SPIRAL Async Effects
// Async runtime primitives for EIR async
// Provides AsyncChannel, AsyncRefCell, AsyncMutex, and ConcurrentEffectLog

import type { Value, AsyncChannel, ErrorVal } from "./types.js";

//==============================================================================
// Async Mutex (mutual exclusion lock)
//==============================================================================

/**
 * AsyncMutex provides cooperative mutual exclusion for async operations
 * Uses a queue-based approach to avoid busy-waiting
 */
export class AsyncMutex {
	private locked = false;
	private queue: (() => void)[] = [];

	/**
	 * Acquire the lock
	 * @returns Promise that resolves when lock is acquired
	 */
	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}

		// Wait in queue for lock to be released
		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	/**
	 * Release the lock
	 * Wakes up the next waiting task if any
	 */
	release(): void {
		if (this.queue.length > 0) {
			// Wake up next waiter
			const next = this.queue.shift();
			next?.();
		} else {
			// No waiters, release lock
			this.locked = false;
		}
	}

	/**
	 * Execute a function while holding the lock
	 * @param fn - Async function to execute
	 * @returns Promise that resolves with the function's result
	 */
	async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	/**
	 * Check if lock is currently held
	 */
	isLocked(): boolean {
		return this.locked;
	}
}

//==============================================================================
// Async RefCell (mutable reference cell with locking)
//==============================================================================

/**
 * AsyncRefCell provides thread-safe mutable state for async operations
 * Uses AsyncMutex to ensure atomic read-modify-write operations
 */
export class AsyncRefCell {
	private value: Value;
	private mutex = new AsyncMutex();

	constructor(initialValue: Value) {
		this.value = initialValue;
	}

	/**
	 * Read the current value
	 * @returns Promise that resolves with the current value
	 */
	read(): Promise<Value> {
		return this.mutex.withLock(() => {
			return this.value;
		});
	}

	/**
	 * Write a new value
	 * @param newValue - New value to store
	 */
	write(newValue: Value): Promise<void> {
		return this.mutex.withLock(() => {
			this.value = newValue;
		});
	}

	/**
	 * Update the value using a function
	 * @param fn - Function that takes the current value and returns the new value
	 */
	update(fn: (current: Value) => Value): Promise<void> {
		return this.mutex.withLock(() => {
			this.value = fn(this.value);
		});
	}

	/**
	 * Get the current value without locking (unsafe, use with caution)
	 */
	getUnsafe(): Value {
		return this.value;
	}

	/**
	 * Set the value without locking (unsafe, use with caution)
	 */
	setUnsafe(value: Value): void {
		this.value = value;
	}
}

//==============================================================================
// Async Channel (Go-style buffered channels)
//==============================================================================

type ChannelRecvResolver = (value: Value) => void;
type ChannelSendResolver = () => void;

interface ChannelSender {
	resolve: ChannelSendResolver;
	reject: (error: Error) => void;
	value: Value;  // Store the value being sent for rendezvous
}

interface ChannelReceiver {
	resolve: ChannelRecvResolver;
	reject: (error: Error) => void;
}

/**
 * AsyncChannel implements Go-style buffered channels for async communication
 * Supports multiple producers/consumers with configurable buffering
 */
export class AsyncChannelImpl implements AsyncChannel {
	private buffer: Value[] = [];
	private capacity: number;
	private closed = false;
	private waitingSenders: ChannelSender[] = [];
	private waitingReceivers: ChannelReceiver[] = [];

	constructor(capacity: number) {
		if (capacity < 0) {
			throw new Error("Channel capacity must be non-negative");
		}
		this.capacity = capacity;
	}

	private assertNotClosed(): void {
		if (this.closed) {
			throw new Error("Cannot send to closed channel");
		}
	}

	private deliverToReceiver(value: Value): boolean {
		if (this.waitingReceivers.length > 0) {
			const receiver = this.waitingReceivers.shift();
			if (receiver) {
				receiver.resolve(value);
			}
			return true;
		}
		return false;
	}

	/**
	 * Send a value to the channel
	 * Blocks if buffer is full, unless channel is closed
	 * @param value - Value to send
	 */
	async send(value: Value): Promise<void> {
		this.assertNotClosed();

		if (this.deliverToReceiver(value)) return;

		if (this.buffer.length < this.capacity) {
			this.buffer.push(value);
			return;
		}

		// Buffer is full, wait for space
		return new Promise<void>((resolve, reject) => {
			this.waitingSenders.push({
				resolve: () => { this.buffer.push(value); resolve(); },
				reject,
				value,
			});
		});
	}

	/**
	 * Try to send without blocking
	 * @param value - Value to send
	 * @returns true if send succeeded, false if channel is full
	 */
	trySend(value: Value): boolean {
		this.assertNotClosed();

		if (this.deliverToReceiver(value)) return true;

		if (this.buffer.length < this.capacity) {
			this.buffer.push(value);
			return true;
		}

		return false;
	}

	private takeFromBuffer(): Value | null {
		if (this.buffer.length === 0) return null;
		const value = this.buffer.shift();
		if (value === undefined) {
			throw new Error("Buffer unexpectedly empty");
		}
		if (this.waitingSenders.length > 0) {
			const sender = this.waitingSenders.shift();
			if (sender) sender.resolve();
		}
		return value;
	}

	private takeFromSender(): Value | null {
		if (this.waitingSenders.length === 0) return null;
		const sender = this.waitingSenders.shift();
		if (!sender) throw new Error("Sender unexpectedly missing");
		sender.resolve();
		return sender.value;
	}

	/**
	 * Receive a value from the channel
	 * Blocks if buffer is empty, until a value arrives or channel is closed
	 * @returns Promise that resolves with the received value
	 */
	async recv(): Promise<Value> {
		const buffered = this.takeFromBuffer();
		if (buffered !== null) return buffered;

		if (this.closed) throw new Error("Cannot receive from closed channel");

		const fromSender = this.takeFromSender();
		if (fromSender !== null) return fromSender;

		return new Promise<Value>((resolve, reject) => {
			this.waitingReceivers.push({ resolve, reject });
		});
	}

	/**
	 * Try to receive without blocking
	 * @returns Received value or null if channel is empty
	 */
	tryRecv(): Value | null {
		const buffered = this.takeFromBuffer();
		if (buffered !== null) return buffered;

		if (this.closed) throw new Error("Cannot receive from closed channel");

		return null;
	}

	/**
	 * Close the channel
	 * No more sends will be allowed, pending receivers will be rejected
	 */
	close(): void {
		if (this.closed) {
			return;
		}

		this.closed = true;

		// Reject all waiting receivers
		for (const receiver of this.waitingReceivers) {
			receiver.reject(new Error("Channel closed"));
		}
		this.waitingReceivers = [];

		// Reject all waiting senders
		for (const sender of this.waitingSenders) {
			sender.reject(new Error("Channel closed"));
		}
		this.waitingSenders = [];
	}

	/**
	 * Check if channel is closed
	 */
	isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get current buffer size
	 */
	size(): number {
		return this.buffer.length;
	}

	/**
	 * Get channel capacity
	 */
	getCapacity(): number {
		return this.capacity;
	}
}

//==============================================================================
// Concurrent Effect Log
//==============================================================================

/**
 * ConcurrentEffect represents an effect with task metadata
 */
export interface ConcurrentEffect {
	taskId: string;
	seqNum: number;
	timestamp: number;
	effect: Effect;
}

/**
 * Effect represents a side effect operation
 */
export interface Effect {
	op: string;
	args: Value[];
	result?: Value;
	error?: ErrorVal;
}

/**
 * ConcurrentEffectLog tracks effects across concurrent tasks
 * Uses sequence numbers and timestamps for ordering
 */
export class ConcurrentEffectLog {
	private effects: ConcurrentEffect[] = [];
	private seqCounter = 0;
	private startTime = Date.now();

	private pushEffect(taskId: string, effect: Effect): void {
		this.effects.push({ taskId, seqNum: this.seqCounter++, timestamp: Date.now() - this.startTime, effect });
	}

	/** Append an effect to the log */
	append(taskId: string, effect: Effect): void {
		this.pushEffect(taskId, effect);
	}

	/** Append an effect with result */
	appendWithResult(taskId: string, effect: Effect, result: Value): void {
		this.pushEffect(taskId, { ...effect, result });
	}

	/** Append an effect with error */
	appendWithError(taskId: string, effect: Effect, error: ErrorVal): void {
		this.pushEffect(taskId, { ...effect, error });
	}

	/** Get all effects ordered by sequence number */
	getOrdered(): Effect[] {
		return [...this.effects].sort((a, b) => a.seqNum - b.seqNum).map((e) => e.effect);
	}

	/** Get all effects for a specific task */
	getByTask(taskId: string): Effect[] {
		return this.effects.filter((e) => e.taskId === taskId).sort((a, b) => a.seqNum - b.seqNum).map((e) => e.effect);
	}

	/** Discard all effects from a task (e.g., on cancellation) */
	discardTask(taskId: string): void { this.effects = this.effects.filter((e) => e.taskId !== taskId); }

	/** Clear all effects */
	clear(): void { this.effects = []; this.seqCounter = 0; this.startTime = Date.now(); }

	/** Get the number of effects logged */
	size(): number { return this.effects.length; }

	/** Get effect statistics */
	getStats(): { total: number; byTask: Map<string, number>; byOp: Map<string, number> } {
		const byTask = new Map<string, number>();
		const byOp = new Map<string, number>();
		for (const e of this.effects) {
			byTask.set(e.taskId, (byTask.get(e.taskId) ?? 0) + 1);
			byOp.set(e.effect.op, (byOp.get(e.effect.op) ?? 0) + 1);
		}
		return { total: this.effects.length, byTask, byOp };
	}
}

//==============================================================================
// Async RefCell Store (map of named ref cells)
//==============================================================================

/**
 * AsyncRefCellStore manages a collection of named reference cells
 */
export class AsyncRefCellStore {
	private cells = new Map<string, AsyncRefCell>();

	/** Get or create a ref cell by name */
	getOrCreate(name: string, initialValue: Value): AsyncRefCell {
		let cell = this.cells.get(name);
		if (!cell) { cell = new AsyncRefCell(initialValue); this.cells.set(name, cell); }
		return cell;
	}

	/** Get an existing ref cell */
	get(name: string): AsyncRefCell | undefined { return this.cells.get(name); }

	/** Delete a ref cell */
	delete(name: string): boolean { return this.cells.delete(name); }

	/** Clear all cells */
	clear(): void { this.cells.clear(); }

	/** Get the number of cells */
	size(): number { return this.cells.size; }
}

//==============================================================================
// Async Channel Store (map of named channels)
//==============================================================================

/**
 * AsyncChannelStore manages a collection of named channels
 */
export class AsyncChannelStore {
	private channels = new Map<string, AsyncChannelImpl>();
	private nextId = 0;

	/** Create a new channel */
	create(capacity: number): string {
		const id = `ch_${this.nextId++}`;
		this.channels.set(id, new AsyncChannelImpl(capacity));
		return id;
	}

	/** Get an existing channel */
	get(id: string): AsyncChannelImpl | undefined { return this.channels.get(id); }

	/** Delete and close a channel */
	delete(id: string): boolean {
		this.channels.get(id)?.close();
		return this.channels.delete(id);
	}

	/** Clear all channels */
	clear(): void {
		for (const channel of this.channels.values()) channel.close();
		this.channels.clear();
	}

	/** Get the number of channels */
	size(): number { return this.channels.size; }
}

//==============================================================================
// Factory Functions
//==============================================================================

/** Create an async mutex */
export function createAsyncMutex(): AsyncMutex { return new AsyncMutex(); }

/** Create an async ref cell */
export function createAsyncRefCell(initialValue: Value): AsyncRefCell { return new AsyncRefCell(initialValue); }

/** Create an async channel */
export function createAsyncChannel(capacity: number): AsyncChannelImpl { return new AsyncChannelImpl(capacity); }

/** Create a concurrent effect log */
export function createConcurrentEffectLog(): ConcurrentEffectLog { return new ConcurrentEffectLog(); }

/** Create an async ref cell store */
export function createAsyncRefCellStore(): AsyncRefCellStore { return new AsyncRefCellStore(); }

/** Create an async channel store */
export function createAsyncChannelStore(): AsyncChannelStore { return new AsyncChannelStore(); }

//==============================================================================
// Type Adapter for use with types.ts
//==============================================================================

// Export the AsyncChannel interface that was forward-declared in types.ts
export type { AsyncChannel };

// The AsyncChannelImpl implements the AsyncChannel interface
// This allows external code to use the interface while we provide the implementation
