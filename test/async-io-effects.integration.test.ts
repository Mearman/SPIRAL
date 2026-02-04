// Test async I/O effects
import { describe, it } from "node:test";
import assert from "node:assert";
import {
	createInMemoryFileSystem,
	createMockHttpClient,
	createAsyncIOConfig,
	evalAsyncEffect,
} from "../src/async-io-effects.ts";
import type { AsyncEvalState } from "../src/types.ts";
import { createTaskScheduler } from "../src/scheduler.ts";
import { stringVal, intVal } from "../src/types.ts";

describe("async-io-effects", () => {
	it("should create an in-memory file system", () => {
		const fs = createInMemoryFileSystem();
		fs.setFile("test.txt", "Hello, World!");
		assert.strictEqual(fs.getFile("test.txt"), "Hello, World!");
		assert.strictEqual(fs.size(), 1);
	});

	it("should read a file asynchronously", async () => {
		const fs = createInMemoryFileSystem();
		fs.setFile("test.txt", "Hello, World!");

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ fileSystem: fs });
		const result = evalAsyncEffect({ effectName: "asyncRead", state, config }, [stringVal("test.txt")]);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			assert.strictEqual(result.status, "pending");

			// Wait for the task to complete
			const value = await scheduler.await(result.taskId);
			assert.strictEqual(value.kind, "string");
			if (value.kind === "string") {
				assert.strictEqual(value.value, "Hello, World!");
			}
		}
	});

	it("should write a file asynchronously", async () => {
		const fs = createInMemoryFileSystem();

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ fileSystem: fs });
		const result = evalAsyncEffect(
			{ effectName: "asyncWrite", state, config },
			[stringVal("test.txt"), stringVal("Hello, World!")],
		);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			assert.strictEqual(result.status, "pending");

			// Wait for the task to complete
			const value = await scheduler.await(result.taskId);
			assert.strictEqual(value.kind, "void");

			// Check file was written
			assert.strictEqual(fs.getFile("test.txt"), "Hello, World!");
		}
	});

	it("should sleep asynchronously", async () => {
		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({});
		const result = evalAsyncEffect({ effectName: "sleep", state, config }, [intVal(10)]);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			assert.strictEqual(result.status, "pending");

			// Wait for the task to complete
			const value = await scheduler.await(result.taskId);
			assert.strictEqual(value.kind, "void");
		}
	});

	it("should make HTTP GET requests asynchronously", async () => {
		const http = createMockHttpClient();
		http.setMockResponse("https://example.com", {
			status: 200,
			headers: new Map(),
			body: "Response body",
		});

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ httpClient: http });
		const result = evalAsyncEffect({ effectName: "httpGet", state, config }, [stringVal("https://example.com")]);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			assert.strictEqual(result.status, "pending");

			// Wait for the task to complete
			const value = await scheduler.await(result.taskId);
			assert.strictEqual(value.kind, "string");
			if (value.kind === "string") {
				assert.strictEqual(value.value, "Response body");
			}
		}
	});

	it("should check file existence asynchronously", async () => {
		const fs = createInMemoryFileSystem();
		fs.setFile("test.txt", "Hello!");

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ fileSystem: fs });

		// Test existing file
		const result1 = evalAsyncEffect({ effectName: "asyncExists", state, config }, [stringVal("test.txt")]);
		assert.strictEqual(result1.kind, "future");
		if (result1.kind === "future") {
			const value1 = await scheduler.await(result1.taskId);
			assert.strictEqual(value1.kind, "int");
			if (value1.kind === "int") {
				assert.strictEqual(value1.value, 1);
			}
		}

		// Test non-existing file
		const result2 = evalAsyncEffect({ effectName: "asyncExists", state, config }, [stringVal("nonexistent.txt")]);
		assert.strictEqual(result2.kind, "future");
		if (result2.kind === "future") {
			const value2 = await scheduler.await(result2.taskId);
			assert.strictEqual(value2.kind, "int");
			if (value2.kind === "int") {
				assert.strictEqual(value2.value, 0);
			}
		}
	});

	it("should append to a file asynchronously", async () => {
		const fs = createInMemoryFileSystem();
		fs.setFile("test.txt", "Hello");

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ fileSystem: fs });
		const result = evalAsyncEffect(
			{ effectName: "asyncAppend", state, config },
			[stringVal("test.txt"), stringVal(", World!")],
		);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			// Wait for the task to complete
			await scheduler.await(result.taskId);

			// Check file was appended
			assert.strictEqual(fs.getFile("test.txt"), "Hello, World!");
		}
	});

	it("should delete a file asynchronously", async () => {
		const fs = createInMemoryFileSystem();
		fs.setFile("test.txt", "Hello");

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ fileSystem: fs });
		const result = evalAsyncEffect({ effectName: "asyncDelete", state, config }, [stringVal("test.txt")]);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			// Wait for the task to complete
			await scheduler.await(result.taskId);

			// Check file was deleted
			assert.strictEqual(fs.getFile("test.txt"), undefined);
		}
	});

	it("should make HTTP POST requests asynchronously", async () => {
		const http = createMockHttpClient();

		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({ httpClient: http });
		const result = evalAsyncEffect(
			{ effectName: "httpPost", state, config },
			[stringVal("https://example.com"), stringVal("Request body")],
		);

		assert.strictEqual(result.kind, "future");
		if (result.kind === "future") {
			// Wait for the task to complete
			const value = await scheduler.await(result.taskId);
			assert.strictEqual(value.kind, "string");
			if (value.kind === "string") {
				assert.strictEqual(value.value, "Echo: Request body");
			}
		}
	});

	it("should handle arity errors", () => {
		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({});

		// Missing arguments
		const result1 = evalAsyncEffect({ effectName: "asyncRead", state, config }, []);
		assert.strictEqual(result1.kind, "error");
		if (result1.kind === "error") {
			assert.strictEqual(result1.code, "ArityError");
		}

		const result2 = evalAsyncEffect({ effectName: "sleep", state, config }, []);
		assert.strictEqual(result2.kind, "error");
		if (result2.kind === "error") {
			assert.strictEqual(result2.code, "ArityError");
		}
	});

	it("should handle type errors", () => {
		const scheduler = createTaskScheduler();
		const state: AsyncEvalState = {
			env: new Map(),
			refCells: new Map(),
			effects: [],
			steps: 0,
			maxSteps: 1000,
			taskId: "main",
			scheduler,
			channels: null,
			taskPool: new Map(),
		};

		const config = createAsyncIOConfig({});

		// Wrong type for filename
		const result1 = evalAsyncEffect({ effectName: "asyncRead", state, config }, [intVal(123)]);
		assert.strictEqual(result1.kind, "error");
		if (result1.kind === "error") {
			assert.strictEqual(result1.code, "TypeError");
		}

		// Wrong type for sleep milliseconds
		const result2 = evalAsyncEffect({ effectName: "sleep", state, config }, [stringVal("100")]);
		assert.strictEqual(result2.kind, "error");
		if (result2.kind === "error") {
			assert.strictEqual(result2.code, "TypeError");
		}
	});
});
