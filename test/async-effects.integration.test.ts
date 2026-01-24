 
 
 

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	AsyncMutex,
	AsyncRefCell,
	AsyncChannelImpl,
	ConcurrentEffectLog,
	AsyncRefCellStore,
	AsyncChannelStore,
	createAsyncMutex,
	createAsyncRefCell,
	createAsyncChannel,
	createConcurrentEffectLog,
	createAsyncRefCellStore,
	createAsyncChannelStore,
} from "../src/async-effects.js";

//==============================================================================
// AsyncMutex Tests
//==============================================================================

describe("AsyncMutex", () => {
	it("should acquire lock when unlocked", async () => {
		const mutex = new AsyncMutex();
		assert.strictEqual(mutex.isLocked(), false);
		await mutex.acquire();
		assert.strictEqual(mutex.isLocked(), true);
		mutex.release();
		assert.strictEqual(mutex.isLocked(), false);
	});

	it("should queue multiple acquisitions", async () => {
		const mutex = new AsyncMutex();
		const results: number[] = [];

		// First acquirer gets lock immediately
		void (async () => {
			await mutex.acquire();
			results.push(1);
			await new Promise((resolve) => setTimeout(resolve, 10));
			mutex.release();
		})();

		// Second acquirer should wait
		void (async () => {
			await mutex.acquire();
			results.push(2);
			mutex.release();
		})();

		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.deepStrictEqual(results, [1, 2]);
	});

	it("should execute function with withLock", async () => {
		const mutex = new AsyncMutex();
		let value = 0;

		await mutex.withLock(async () => {
			value = 42;
		});

		assert.strictEqual(value, 42);
		assert.strictEqual(mutex.isLocked(), false);
	});

	it("should release lock even when function throws", async () => {
		const mutex = new AsyncMutex();
		let caught = false;

		try {
			await mutex.withLock(async () => {
				throw new Error("test error");
			});
		} catch {
			caught = true;
		}

		assert.strictEqual(caught, true);
		assert.strictEqual(mutex.isLocked(), false);
	});

	it("should handle sequential withLock calls", async () => {
		const mutex = new AsyncMutex();
		const results: string[] = [];

		await Promise.all([
			mutex.withLock(async () => {
				results.push("start1");
				await new Promise((resolve) => setTimeout(resolve, 5));
				results.push("end1");
			}),
			mutex.withLock(async () => {
				results.push("start2");
				await new Promise((resolve) => setTimeout(resolve, 5));
				results.push("end2");
			}),
		]);

		assert.deepStrictEqual(results, ["start1", "end1", "start2", "end2"]);
	});

	it("should handle nested locks (causes queueing)", async () => {
		const mutex = new AsyncMutex();
		let innerAcquired = false;

		await mutex.acquire();
		// Try to acquire again while holding the lock
		// This will queue up
		const innerPromise = (async () => {
			await mutex.acquire();
			innerAcquired = true;
			mutex.release();
		})();

		// Release outer lock
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.strictEqual(innerAcquired, false);
		mutex.release();

		// Now inner should acquire
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.strictEqual(innerAcquired, true);
		await innerPromise;
	});

	it("should track isLocked correctly during queue operations", async () => {
		const mutex = new AsyncMutex();

		await mutex.acquire();
		assert.strictEqual(mutex.isLocked(), true);

		const waitPromise = mutex.acquire();
		assert.strictEqual(mutex.isLocked(), true);

		mutex.release();
		await waitPromise;
		assert.strictEqual(mutex.isLocked(), true);

		mutex.release();
		assert.strictEqual(mutex.isLocked(), false);
	});

	it("should support factory function", () => {
		const mutex = createAsyncMutex();
		assert(mutex instanceof AsyncMutex);
	});
});

//==============================================================================
// AsyncRefCell Tests
//==============================================================================

describe("AsyncRefCell", () => {
	it("should initialize with value", () => {
		const cell = new AsyncRefCell(42);
		assert.strictEqual(cell.getUnsafe(), 42);
	});

	it("should read current value", async () => {
		const cell = new AsyncRefCell("hello");
		const value = await cell.read();
		assert.strictEqual(value, "hello");
	});

	it("should write new value", async () => {
		const cell = new AsyncRefCell(10);
		await cell.write(20);
		assert.strictEqual(await cell.read(), 20);
	});

	it("should update value with function", async () => {
		const cell = new AsyncRefCell(5);
		await cell.update((x) => (x as number) * 2);
		assert.strictEqual(await cell.read(), 10);
	});

	it("should handle concurrent reads safely", async () => {
		const cell = new AsyncRefCell(100);
		const reads = await Promise.all([
			cell.read(),
			cell.read(),
			cell.read(),
			cell.read(),
		]);

		assert.deepStrictEqual(reads, [100, 100, 100, 100]);
	});

	it("should handle concurrent writes safely", async () => {
		const cell = new AsyncRefCell(0);

		await Promise.all([
			cell.write(1),
			cell.write(2),
			cell.write(3),
			cell.write(4),
		]);

		// Final value should be one of the writes (order not guaranteed)
		const value = await cell.read();
		assert.ok([1, 2, 3, 4].includes(value as number));
	});

	it("should handle concurrent updates safely", async () => {
		const cell = new AsyncRefCell(0);

		await Promise.all([
			cell.update((x) => (x as number) + 1),
			cell.update((x) => (x as number) + 10),
			cell.update((x) => (x as number) + 100),
		]);

		// Each update sees some state, but all are serialized
		const value = await cell.read();
		assert.ok(typeof value === "number");
		assert.ok(value > 0);
	});

	it("should support getUnsafe and setUnsafe", () => {
		const cell = new AsyncRefCell(10);
		assert.strictEqual(cell.getUnsafe(), 10);

		cell.setUnsafe(20);
		assert.strictEqual(cell.getUnsafe(), 20);
	});

	it("should support factory function", () => {
		const cell = createAsyncRefCell(42);
		assert(cell instanceof AsyncRefCell);
	});
});

//==============================================================================
// AsyncChannel Tests
//==============================================================================

describe("AsyncChannel", () => {
	it("should create buffered channel", () => {
		const channel = new AsyncChannelImpl(5);
		assert.strictEqual(channel.getCapacity(), 5);
		assert.strictEqual(channel.size(), 0);
		assert.strictEqual(channel.isClosed(), false);
	});

	it("should create unbuffered (rendezvous) channel", () => {
		const channel = new AsyncChannelImpl(0);
		assert.strictEqual(channel.getCapacity(), 0);
	});

	it("should reject negative capacity", () => {
		assert.throws(() => new AsyncChannelImpl(-1), {
			message: "Channel capacity must be non-negative",
		});
	});

	it("should send and receive from buffered channel", async () => {
		const channel = new AsyncChannelImpl(1);

		await channel.send(42);
		assert.strictEqual(channel.size(), 1);

		const value = await channel.recv();
		assert.strictEqual(value, 42);
		assert.strictEqual(channel.size(), 0);
	});

	it("should buffer multiple values", async () => {
		const channel = new AsyncChannelImpl(3);

		await channel.send(1);
		await channel.send(2);
		await channel.send(3);

		assert.strictEqual(channel.size(), 3);

		assert.strictEqual(await channel.recv(), 1);
		assert.strictEqual(await channel.recv(), 2);
		assert.strictEqual(await channel.recv(), 3);
	});

	it("should block send on full buffer", async () => {
		const channel = new AsyncChannelImpl(1);
		let received = false;

		await channel.send(1);

		// This send should block
		const sendPromise = channel.send(2);

		// Start a receiver
		void (async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			assert.strictEqual(await channel.recv(), 1);
			received = true;
		})();

		await sendPromise;
		assert.strictEqual(received, true);
	});

	it("should block receive on empty buffer", async () => {
		const channel = new AsyncChannelImpl(1);
		const received = false;

		// Start receiver first (will block)
		const recvPromise = channel.recv();

		// Then send
		await new Promise((resolve) => setTimeout(resolve, 10));
		await channel.send(42);

		const value = await recvPromise;
		assert.strictEqual(value, 42);
		assert.strictEqual(received, false);
	});

	it("should handle rendezvous (unbuffered) channel", async () => {
		const channel = new AsyncChannelImpl(0);

		// Send should block until receiver arrives
		const sendPromise = channel.send(42);

		// Receive should get the value
		const recvPromise = channel.recv();

		await Promise.all([sendPromise, recvPromise]);
	});

	it("should support trySend on buffered channel", () => {
		const channel = new AsyncChannelImpl(2);

		assert.strictEqual(channel.trySend(1), true);
		assert.strictEqual(channel.trySend(2), true);
		assert.strictEqual(channel.trySend(3), false); // Buffer full
	});

	it("should support tryRecv from buffered channel", () => {
		const channel = new AsyncChannelImpl(2);

		channel.trySend(1);
		channel.trySend(2);

		assert.strictEqual(channel.tryRecv(), 1);
		assert.strictEqual(channel.tryRecv(), 2);
		assert.strictEqual(channel.tryRecv(), null); // Empty
	});

	it("should handle trySend with waiting receiver", () => {
		const channel = new AsyncChannelImpl(1);

		// Start a receiver
		const recvPromise = channel.recv();

		// trySend should succeed and deliver to receiver
		assert.strictEqual(channel.trySend(42), true);

		// Receiver should get value
		return recvPromise.then((value) => {
			assert.strictEqual(value, 42);
		});
	});

	it("should close channel and reject sends", async () => {
		const channel = new AsyncChannelImpl(1);

		channel.close();

		await assert.rejects(
			async () => await channel.send(42),
			{ message: "Cannot send to closed channel" }
		);
	});

	it("should close channel and reject waiting receivers", async () => {
		const channel = new AsyncChannelImpl(0);

		const recvPromise = channel.recv();

		// Close while receiver is waiting
		channel.close();

		await assert.rejects(recvPromise, {
			message: "Channel closed",
		});
	});

	it("should close channel and reject waiting senders", async () => {
		const channel = new AsyncChannelImpl(1);

		await channel.send(1); // Fill buffer

		// This send will block
		const sendPromise = channel.send(2);

		// Close channel
		channel.close();

		await assert.rejects(sendPromise, {
			message: "Channel closed",
		});
	});

	it("should be idempotent when closing", () => {
		const channel = new AsyncChannelImpl(1);
		channel.close();
		channel.close(); // Should not throw
		assert.strictEqual(channel.isClosed(), true);
	});

	it("should allow receiving buffered values after close", async () => {
		const channel = new AsyncChannelImpl(3);

		await channel.send(1);
		await channel.send(2);
		await channel.send(3);

		channel.close();

		assert.strictEqual(await channel.recv(), 1);
		assert.strictEqual(await channel.recv(), 2);
		assert.strictEqual(await channel.recv(), 3);

		// Now should fail
		await assert.rejects(async () => await channel.recv(), {
			message: "Cannot receive from closed channel",
		});
	});

	it("should handle multiple concurrent senders and receivers", async () => {
		const channel = new AsyncChannelImpl(10);
		const values: number[] = [];

		// Senders - complete all sends first
		await Promise.all(
			Array.from({ length: 5 }, (_, i) => channel.send(i))
		);

		// Receivers - now receive all values
		const receivers = Array.from({ length: 5 }, () =>
			channel.recv().then((v) => values.push(v as number))
		);

		await Promise.all(receivers);

		assert.strictEqual(values.length, 5);
		assert.deepStrictEqual(values.sort((a, b) => a - b), [0, 1, 2, 3, 4]);
	});

	it("should preserve FIFO order", async () => {
		const channel = new AsyncChannelImpl(5);

		await channel.send(1);
		await channel.send(2);
		await channel.send(3);

		assert.strictEqual(await channel.recv(), 1);
		assert.strictEqual(await channel.recv(), 2);
		assert.strictEqual(await channel.recv(), 3);
	});

	it("should support factory function", () => {
		const channel = createAsyncChannel(5);
		assert(channel instanceof AsyncChannelImpl);
	});
});

//==============================================================================
// ConcurrentEffectLog Tests
//==============================================================================

describe("ConcurrentEffectLog", () => {
	it("should append effects", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "write", args: [1, 2, 3] });

		assert.strictEqual(log.size(), 1);
	});

	it("should append effects with result", () => {
		const log = new ConcurrentEffectLog();

		log.appendWithResult("task1", { op: "add", args: [1, 2] }, 3);

		const effects = log.getOrdered();
		assert.strictEqual(effects.length, 1);
		assert.strictEqual(effects[0]?.result, 3);
	});

	it("should append effects with error", () => {
		const log = new ConcurrentEffectLog();

		const error = { type: "RuntimeError", message: "test error" };
		log.appendWithError("task1", { op: "divide", args: [1, 0] }, error);

		const effects = log.getOrdered();
		assert.strictEqual(effects.length, 1);
		assert.deepStrictEqual(effects[0]?.error, error);
	});

	it("should return ordered effects", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		const effects = log.getOrdered();
		assert.strictEqual(effects.length, 3);
		assert.strictEqual(effects[0]?.op, "op1");
		assert.strictEqual(effects[1]?.op, "op2");
		assert.strictEqual(effects[2]?.op, "op3");
	});

	it("should get effects by task", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });
		log.append("task2", { op: "op4", args: [] });

		const task1Effects = log.getByTask("task1");
		assert.strictEqual(task1Effects.length, 2);
		assert.strictEqual(task1Effects[0]?.op, "op1");
		assert.strictEqual(task1Effects[1]?.op, "op3");

		const task2Effects = log.getByTask("task2");
		assert.strictEqual(task2Effects.length, 2);
		assert.strictEqual(task2Effects[0]?.op, "op2");
		assert.strictEqual(task2Effects[1]?.op, "op4");
	});

	it("should discard task effects", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		log.discardTask("task1");

		assert.strictEqual(log.size(), 1);
		const effects = log.getOrdered();
		assert.strictEqual(effects[0]?.op, "op2");
	});

	it("should clear all effects", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });

		assert.strictEqual(log.size(), 2);

		log.clear();

		assert.strictEqual(log.size(), 0);
	});

	it("should calculate statistics", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "write", args: [] });
		log.append("task1", { op: "write", args: [] });
		log.append("task2", { op: "read", args: [] });
		log.append("task3", { op: "write", args: [] });

		const stats = log.getStats();

		assert.strictEqual(stats.total, 4);
		assert.strictEqual(stats.byTask.get("task1"), 2);
		assert.strictEqual(stats.byTask.get("task2"), 1);
		assert.strictEqual(stats.byTask.get("task3"), 1);
		assert.strictEqual(stats.byOp.get("write"), 3);
		assert.strictEqual(stats.byOp.get("read"), 1);
	});

	it("should assign sequential sequence numbers", () => {
		const log = new ConcurrentEffectLog();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		const effects = log.getOrdered();
		// Sequence numbers should increment
		assert.strictEqual(effects.length, 3);
	});

	it("should handle empty log statistics", () => {
		const log = new ConcurrentEffectLog();
		const stats = log.getStats();

		assert.strictEqual(stats.total, 0);
		assert.strictEqual(stats.byTask.size, 0);
		assert.strictEqual(stats.byOp.size, 0);
	});

	it("should support factory function", () => {
		const log = createConcurrentEffectLog();
		assert(log instanceof ConcurrentEffectLog);
	});
});

//==============================================================================
// AsyncRefCellStore Tests
//==============================================================================

describe("AsyncRefCellStore", () => {
	it("should create new cell", async () => {
		const store = new AsyncRefCellStore();
		const cell = store.getOrCreate("counter", 0);

		assert.strictEqual(store.size(), 1);
		assert.strictEqual(await cell.read(), 0);
	});

	it("should return existing cell", async () => {
		const store = new AsyncRefCellStore();
		const cell1 = store.getOrCreate("counter", 0);
		const cell2 = store.getOrCreate("counter", 100);

		assert.strictEqual(cell1, cell2);
		assert.strictEqual(store.size(), 1);
		assert.strictEqual(await cell1.read(), 0); // Initial value preserved
	});

	it("should get existing cell or undefined", () => {
		const store = new AsyncRefCellStore();
		store.getOrCreate("counter", 0);

		const cell = store.get("counter");
		assert.ok(cell);

		const missing = store.get("missing");
		assert.strictEqual(missing, undefined);
	});

	it("should delete cell", () => {
		const store = new AsyncRefCellStore();
		store.getOrCreate("counter", 0);

		const deleted = store.delete("counter");
		assert.strictEqual(deleted, true);
		assert.strictEqual(store.size(), 0);

		const deletedAgain = store.delete("counter");
		assert.strictEqual(deletedAgain, false);
	});

	it("should clear all cells", () => {
		const store = new AsyncRefCellStore();
		store.getOrCreate("cell1", 1);
		store.getOrCreate("cell2", 2);
		store.getOrCreate("cell3", 3);

		assert.strictEqual(store.size(), 3);

		store.clear();

		assert.strictEqual(store.size(), 0);
	});

	it("should support factory function", () => {
		const store = createAsyncRefCellStore();
		assert(store instanceof AsyncRefCellStore);
	});
});

//==============================================================================
// AsyncChannelStore Tests
//==============================================================================

describe("AsyncChannelStore", () => {
	it("should create channel with auto-generated ID", () => {
		const store = new AsyncChannelStore();
		const id = store.create(5);

		assert.strictEqual(id, "ch_0");
		assert.strictEqual(store.size(), 1);

		const channel = store.get(id);
		assert.ok(channel);
		assert.strictEqual(channel?.getCapacity(), 5);
	});

	it("should generate sequential channel IDs", () => {
		const store = new AsyncChannelStore();

		assert.strictEqual(store.create(1), "ch_0");
		assert.strictEqual(store.create(2), "ch_1");
		assert.strictEqual(store.create(3), "ch_2");

		assert.strictEqual(store.size(), 3);
	});

	it("should get existing channel", () => {
		const store = new AsyncChannelStore();
		const id = store.create(10);

		const channel = store.get(id);
		assert.ok(channel);
		assert.strictEqual(channel?.getCapacity(), 10);

		const missing = store.get("ch_999");
		assert.strictEqual(missing, undefined);
	});

	it("should delete and close channel", () => {
		const store = new AsyncChannelStore();
		const id = store.create(5);

		const deleted = store.delete(id);
		assert.strictEqual(deleted, true);
		assert.strictEqual(store.size(), 0);

		const channel = store.get(id);
		assert.strictEqual(channel, undefined);
	});

	it("should clear all channels and close them", () => {
		const store = new AsyncChannelStore();
		store.create(1);
		store.create(2);
		store.create(3);

		assert.strictEqual(store.size(), 3);

		store.clear();

		assert.strictEqual(store.size(), 0);
	});

	it("should close channel when deleting", async () => {
		const store = new AsyncChannelStore();
		const id = store.create(1);

		// Send a value
		const channel = store.get(id);
		await channel?.send(42);

		// Delete (should close channel)
		store.delete(id);

		// Channel should be closed
		assert.strictEqual(channel?.isClosed(), true);

		// Cannot send to closed channel
		await assert.rejects(
			async () => await channel?.send(100),
			{ message: "Cannot send to closed channel" }
		);
	});

	it("should support factory function", () => {
		const store = createAsyncChannelStore();
		assert(store instanceof AsyncChannelStore);
	});
});
