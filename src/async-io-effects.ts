// SPIRAL Async I/O Effects
// Extended async I/O effect system with file system simulation and HTTP mocking
// Extends the base effects system with AsyncIOEffectRegistry and in-memory file store

import type { Value, AsyncEvalState } from "./types.js";
import {
	stringType,
	intType,
	voidType,
	stringVal,
	intVal,
	voidVal,
	errorVal,
	futureType,
	futureVal,
	ErrorCodes,
} from "./types.js";
import type { EffectRegistry } from "./effects.js";
import { emptyEffectRegistry, registerEffect } from "./effects.js";

//==============================================================================
// In-Memory File System (for testing)
//==============================================================================

/**
 * In-memory file system for testing async I/O effects
 * Simulates file operations without touching the real filesystem
 */
export class InMemoryFileSystem {
	private files = new Map<string, string>();

	/**
	 * Read a file from memory
	 * @param filename - Name of the file to read
	 * @returns Promise resolving to file content or error if not found
	 */
	async readFile(filename: string): Promise<string> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 10));

		const content = this.files.get(filename);
		if (content === undefined) {
			throw new Error(`File not found: ${filename}`);
		}
		return content;
	}

	/**
	 * Write content to a file in memory
	 * @param filename - Name of the file to write
	 * @param content - Content to write
	 * @returns Promise that resolves when write completes
	 */
	async writeFile(filename: string, content: string): Promise<void> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 10));

		this.files.set(filename, content);
	}

	/**
	 * Append content to a file in memory
	 * @param filename - Name of the file to append to
	 * @param content - Content to append
	 * @returns Promise that resolves when append completes
	 */
	async appendFile(filename: string, content: string): Promise<void> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 10));

		const existing = this.files.get(filename) ?? "";
		this.files.set(filename, existing + content);
	}

	/**
	 * Delete a file from memory
	 * @param filename - Name of the file to delete
	 * @returns Promise that resolves when delete completes
	 */
	async deleteFile(filename: string): Promise<void> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 5));

		this.files.delete(filename);
	}

	/**
	 * Check if a file exists
	 * @param filename - Name of the file to check
	 * @returns Promise resolving to true if file exists
	 */
	async exists(filename: string): Promise<boolean> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 5));

		return this.files.has(filename);
	}

	/**
	 * List all files
	 * @returns Promise resolving to array of filenames
	 */
	async listFiles(): Promise<string[]> {
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 5));

		return Array.from(this.files.keys());
	}

	/**
	 * Set a file's content directly (synchronous, for setup)
	 */
	setFile(filename: string, content: string): void {
		this.files.set(filename, content);
	}

	/**
	 * Get a file's content directly (synchronous, for testing)
	 */
	getFile(filename: string): string | undefined {
		return this.files.get(filename);
	}

	/**
	 * Clear all files
	 */
	clear(): void {
		this.files.clear();
	}

	/**
	 * Get the number of files
	 */
	size(): number {
		return this.files.size;
	}
}

//==============================================================================
// Mock HTTP Client (for testing)
//==============================================================================

/**
 * Mock HTTP response
 */
export interface MockHttpResponse {
	status: number;
	headers: Map<string, string>;
	body: string;
}

/**
 * Mock HTTP client for testing async HTTP effects
 * Simulates HTTP requests without making real network calls
 */
export class MockHttpClient {
	private responses = new Map<string, MockHttpResponse>();
	private defaultResponse: MockHttpResponse = {
		status: 404,
		headers: new Map(),
		body: "Not Found",
	};

	/**
	 * Make a GET request
	 * @param url - URL to request
	 * @returns Promise resolving to response body
	 */
	async get(url: string): Promise<string> {
		// Simulate network delay
		await new Promise((resolve) => setTimeout(resolve, 50));

		const response = this.responses.get(url) ?? this.defaultResponse;

		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status}: ${response.body}`);
		}

		return response.body;
	}

	/**
	 * Make a POST request
	 * @param url - URL to request
	 * @param body - Request body
	 * @returns Promise resolving to response body
	 */
	async post(_url: string, body: string): Promise<string> {
		// Simulate network delay
		await new Promise((resolve) => setTimeout(resolve, 50));

		// For mocking, just return echo of the body
		return `Echo: ${body}`;
	}

	/**
	 * Register a mock response for a URL
	 */
	setMockResponse(url: string, response: MockHttpResponse): void {
		this.responses.set(url, response);
	}

	/**
	 * Set the default response for unmatched URLs
	 */
	setDefaultResponse(response: MockHttpResponse): void {
		this.defaultResponse = response;
	}

	/**
	 * Clear all mock responses
	 */
	clear(): void {
		this.responses.clear();
	}
}

//==============================================================================
// Async I/O Effect Registry
//==============================================================================

/**
 * Configuration for async I/O effects
 */
export interface AsyncIOEffectConfig {
	fileSystem?: InMemoryFileSystem;
	httpClient?: MockHttpClient;
}

/**
 * Async I/O effect registry extends the base effect registry
 * with async I/O operations that have access to file system and HTTP client
 */
export class AsyncIOEffectRegistry {
	// Store config for use when evaluating effects
	private readonly _config: AsyncIOEffectConfig;

	constructor(config: AsyncIOEffectConfig = {}) {
		this._config = config;
	}

	/**
	 * Get the stored config
	 */
	getConfig(): AsyncIOEffectConfig {
		return this._config;
	}

	/**
	 * Get the effect registry
	 */
	getRegistry(): EffectRegistry {
		let registry = emptyEffectRegistry();

		// Register all async I/O effects
		registry = this.registerExtendedEffects(registry);

		return registry;
	}

	/**
	 * Register extended async I/O effects
	 */
	private registerExtendedEffects(registry: EffectRegistry): EffectRegistry {
		// All effects are registered with placeholder functions
		// The actual execution is handled by evalAsyncEffect

		// asyncRead effect
		registry = registerEffect(registry, {
			name: "asyncRead",
			params: [stringType],
			returns: futureType(stringType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// asyncWrite effect
		registry = registerEffect(registry, {
			name: "asyncWrite",
			params: [stringType, stringType],
			returns: futureType(voidType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// sleep effect
		registry = registerEffect(registry, {
			name: "sleep",
			params: [intType],
			returns: futureType(voidType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// httpGet effect
		registry = registerEffect(registry, {
			name: "httpGet",
			params: [stringType],
			returns: futureType(stringType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// httpPost effect
		registry = registerEffect(registry, {
			name: "httpPost",
			params: [stringType, stringType],
			returns: futureType(stringType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// asyncAppend effect
		registry = registerEffect(registry, {
			name: "asyncAppend",
			params: [stringType, stringType],
			returns: futureType(voidType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// asyncDelete effect
		registry = registerEffect(registry, {
			name: "asyncDelete",
			params: [stringType],
			returns: futureType(voidType),
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		// asyncExists effect
		registry = registerEffect(registry, {
			name: "asyncExists",
			params: [stringType],
			returns: futureType(intType), // Using int as boolean (0/1)
			pure: false,
			fn: () => {
				return errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations");
			},
		});

		return registry;
	}
}

//==============================================================================
// Async Effect Evaluation Helper
//==============================================================================

/**
 * Evaluate an async effect with access to AsyncEvalState
 * This function handles async effects that need the scheduler and file system
 */
export function evalAsyncEffect(
	effectName: string,
	state: AsyncEvalState,
	config: AsyncIOEffectConfig,
	...args: Value[]
): Value {
	const fileSystem = config.fileSystem ?? new InMemoryFileSystem();
	const httpClient = config.httpClient ?? new MockHttpClient();

	switch (effectName) {
		case "asyncRead": {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "asyncRead requires 1 argument (filename)");
			}
			const filename = args[0]!;
			if (filename.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncRead filename must be a string");
			}

			const taskId = `asyncRead_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					const content = await fileSystem.readFile(filename.value);
					return stringVal(content);
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "asyncWrite": {
			if (args.length < 2) {
				return errorVal(ErrorCodes.ArityError, "asyncWrite requires 2 arguments (filename, content)");
			}
			const filename = args[0]!;
			const content = args[1]!;
			if (filename.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncWrite filename must be a string");
			}
			if (content.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncWrite content must be a string");
			}

			const taskId = `asyncWrite_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					await fileSystem.writeFile(filename.value, content.value);
					return voidVal();
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "asyncAppend": {
			if (args.length < 2) {
				return errorVal(ErrorCodes.ArityError, "asyncAppend requires 2 arguments (filename, content)");
			}
			const filename = args[0]!;
			const content = args[1]!;
			if (filename.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncAppend filename must be a string");
			}
			if (content.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncAppend content must be a string");
			}

			const taskId = `asyncAppend_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					await fileSystem.appendFile(filename.value, content.value);
					return voidVal();
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "asyncDelete": {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "asyncDelete requires 1 argument (filename)");
			}
			const filename = args[0]!;
			if (filename.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncDelete filename must be a string");
			}

			const taskId = `asyncDelete_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					await fileSystem.deleteFile(filename.value);
					return voidVal();
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "asyncExists": {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "asyncExists requires 1 argument (filename)");
			}
			const filename = args[0]!;
			if (filename.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "asyncExists filename must be a string");
			}

			const taskId = `asyncExists_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					const exists = await fileSystem.exists(filename.value);
					return intVal(exists ? 1 : 0);
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "sleep": {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "sleep requires 1 argument (milliseconds)");
			}
			const ms = args[0]!;
			if (ms.kind !== "int") {
				return errorVal(ErrorCodes.TypeError, "sleep milliseconds must be an integer");
			}

			const taskId = `sleep_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				await new Promise<void>((resolve) => setTimeout(resolve, ms.value));
				return voidVal();
			});

			return futureVal(taskId, "pending");
		}

		case "httpGet": {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "httpGet requires 1 argument (url)");
			}
			const url = args[0]!;
			if (url.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "httpGet url must be a string");
			}

			const taskId = `httpGet_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					const body = await httpClient.get(url.value);
					return stringVal(body);
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		case "httpPost": {
			if (args.length < 2) {
				return errorVal(ErrorCodes.ArityError, "httpPost requires 2 arguments (url, body)");
			}
			const url = args[0]!;
			const body = args[1]!;
			if (url.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "httpPost url must be a string");
			}
			if (body.kind !== "string") {
				return errorVal(ErrorCodes.TypeError, "httpPost body must be a string");
			}

			const taskId = `httpPost_${Date.now()}_${Math.random().toString(36).slice(2)}`;

			state.scheduler.spawn(taskId, async () => {
				try {
					const responseBody = await httpClient.post(url.value, body.value);
					return stringVal(responseBody);
				} catch (e) {
					return errorVal(ErrorCodes.DomainError, String(e));
				}
			});

			return futureVal(taskId, "pending");
		}

		default:
			return errorVal(ErrorCodes.UnknownOperator, `Unknown async effect: ${effectName}`);
	}
}

//==============================================================================
// Factory Functions
//==============================================================================

/**
 * Create an async I/O effect registry
 */
export function createAsyncEffectRegistry(config?: AsyncIOEffectConfig): AsyncIOEffectRegistry {
	return new AsyncIOEffectRegistry(config);
}

/**
 * Create an in-memory file system for testing
 */
export function createInMemoryFileSystem(): InMemoryFileSystem {
	return new InMemoryFileSystem();
}

/**
 * Create a mock HTTP client for testing
 */
export function createMockHttpClient(): MockHttpClient {
	return new MockHttpClient();
}

/**
 * Create async I/O effect config for testing
 */
export function createAsyncIOConfig(config?: AsyncIOEffectConfig): AsyncIOEffectConfig {
	return {
		fileSystem: config?.fileSystem ?? new InMemoryFileSystem(),
		httpClient: config?.httpClient ?? new MockHttpClient(),
	};
}
