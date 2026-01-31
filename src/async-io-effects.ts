// SPIRAL Async I/O Effects
// Extended async I/O effect system with file system simulation and HTTP mocking
// Extends the base effects system with AsyncIOEffectRegistry and in-memory file store

import type { Value, AsyncEvalState, Type } from "./types.js";
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

	async readFile(filename: string): Promise<string> {
		await new Promise((resolve) => setTimeout(resolve, 10));
		const content = this.files.get(filename);
		if (content === undefined) {
			throw new Error(`File not found: ${filename}`);
		}
		return content;
	}

	async writeFile(filename: string, content: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 10));
		this.files.set(filename, content);
	}

	async appendFile(filename: string, content: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 10));
		const existing = this.files.get(filename) ?? "";
		this.files.set(filename, existing + content);
	}

	async deleteFile(filename: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 5));
		this.files.delete(filename);
	}

	async exists(filename: string): Promise<boolean> {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return this.files.has(filename);
	}

	async listFiles(): Promise<string[]> {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return Array.from(this.files.keys());
	}

	setFile(filename: string, content: string): void {
		this.files.set(filename, content);
	}

	getFile(filename: string): string | undefined {
		return this.files.get(filename);
	}

	clear(): void {
		this.files.clear();
	}

	size(): number {
		return this.files.size;
	}
}

//==============================================================================
// Mock HTTP Client (for testing)
//==============================================================================

export interface MockHttpResponse {
	status: number;
	headers: Map<string, string>;
	body: string;
}

export class MockHttpClient {
	private responses = new Map<string, MockHttpResponse>();
	private defaultResponse: MockHttpResponse = {
		status: 404,
		headers: new Map(),
		body: "Not Found",
	};

	async get(url: string): Promise<string> {
		await new Promise((resolve) => setTimeout(resolve, 50));
		const response = this.responses.get(url) ?? this.defaultResponse;
		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status}: ${response.body}`);
		}
		return response.body;
	}

	async post(_url: string, body: string): Promise<string> {
		await new Promise((resolve) => setTimeout(resolve, 50));
		return `Echo: ${body}`;
	}

	setMockResponse(url: string, response: MockHttpResponse): void {
		this.responses.set(url, response);
	}

	setDefaultResponse(response: MockHttpResponse): void {
		this.defaultResponse = response;
	}

	clear(): void {
		this.responses.clear();
	}
}

//==============================================================================
// Async I/O Effect Registry
//==============================================================================

export interface AsyncIOEffectConfig {
	fileSystem?: InMemoryFileSystem;
	httpClient?: MockHttpClient;
}

export interface AsyncEffectContext {
	effectName: string;
	state: AsyncEvalState;
	config: AsyncIOEffectConfig;
}

interface EffectDef {
	name: string;
	params: Type[];
	returns: Type;
}

const EFFECT_DEFS: EffectDef[] = [
	{ name: "asyncRead", params: [stringType], returns: futureType(stringType) },
	{ name: "asyncWrite", params: [stringType, stringType], returns: futureType(voidType) },
	{ name: "sleep", params: [intType], returns: futureType(voidType) },
	{ name: "httpGet", params: [stringType], returns: futureType(stringType) },
	{ name: "httpPost", params: [stringType, stringType], returns: futureType(stringType) },
	{ name: "asyncAppend", params: [stringType, stringType], returns: futureType(voidType) },
	{ name: "asyncDelete", params: [stringType], returns: futureType(voidType) },
	{ name: "asyncExists", params: [stringType], returns: futureType(intType) },
];

export class AsyncIOEffectRegistry {
	private readonly _config: AsyncIOEffectConfig;

	constructor(config: AsyncIOEffectConfig = {}) {
		this._config = config;
	}

	getConfig(): AsyncIOEffectConfig {
		return this._config;
	}

	getRegistry(): EffectRegistry {
		let registry = emptyEffectRegistry();
		for (const def of EFFECT_DEFS) {
			registry = registerEffect(registry, {
				name: def.name,
				params: def.params,
				returns: def.returns,
				pure: false,
				fn: () => errorVal(ErrorCodes.DomainError, "Use evalAsyncEffect for async operations"),
			});
		}
		return registry;
	}
}

//==============================================================================
// Async Effect Evaluation
//==============================================================================

function generateTaskId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function extractStringArg(args: Value[], index: number, label: string): { value: string } | { error: Value } {
	const arg = args[index];
	if (arg?.kind !== "string") {
		return { error: errorVal(ErrorCodes.TypeError, `${label} must be a string`) };
	}
	return { value: arg.value };
}

function isExtractError(result: { value: string } | { error: Value }): result is { error: Value } {
	return "error" in result;
}

function spawnTask(ctx: AsyncEffectContext, prefix: string, task: () => Promise<Value>): Value {
	const taskId = generateTaskId(prefix);
	ctx.state.scheduler.spawn(taskId, task);
	return futureVal(taskId, "pending");
}

function handleAsyncRead(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 1) return errorVal(ErrorCodes.ArityError, "asyncRead requires 1 argument (filename)");
	const r0 = extractStringArg(args, 0, "asyncRead filename");
	if (isExtractError(r0)) return r0.error;
	const fs = ctx.config.fileSystem ?? new InMemoryFileSystem();
	return spawnTask(ctx, "asyncRead", async () => {
		try { return stringVal(await fs.readFile(r0.value)); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleAsyncWrite(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 2) return errorVal(ErrorCodes.ArityError, "asyncWrite requires 2 arguments (filename, content)");
	const r0 = extractStringArg(args, 0, "asyncWrite filename");
	if (isExtractError(r0)) return r0.error;
	const r1 = extractStringArg(args, 1, "asyncWrite content");
	if (isExtractError(r1)) return r1.error;
	const fs = ctx.config.fileSystem ?? new InMemoryFileSystem();
	return spawnTask(ctx, "asyncWrite", async () => {
		try { await fs.writeFile(r0.value, r1.value); return voidVal(); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleAsyncAppend(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 2) return errorVal(ErrorCodes.ArityError, "asyncAppend requires 2 arguments (filename, content)");
	const r0 = extractStringArg(args, 0, "asyncAppend filename");
	if (isExtractError(r0)) return r0.error;
	const r1 = extractStringArg(args, 1, "asyncAppend content");
	if (isExtractError(r1)) return r1.error;
	const fs = ctx.config.fileSystem ?? new InMemoryFileSystem();
	return spawnTask(ctx, "asyncAppend", async () => {
		try { await fs.appendFile(r0.value, r1.value); return voidVal(); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleAsyncDelete(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 1) return errorVal(ErrorCodes.ArityError, "asyncDelete requires 1 argument (filename)");
	const r0 = extractStringArg(args, 0, "asyncDelete filename");
	if (isExtractError(r0)) return r0.error;
	const fs = ctx.config.fileSystem ?? new InMemoryFileSystem();
	return spawnTask(ctx, "asyncDelete", async () => {
		try { await fs.deleteFile(r0.value); return voidVal(); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleAsyncExists(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 1) return errorVal(ErrorCodes.ArityError, "asyncExists requires 1 argument (filename)");
	const r0 = extractStringArg(args, 0, "asyncExists filename");
	if (isExtractError(r0)) return r0.error;
	const fs = ctx.config.fileSystem ?? new InMemoryFileSystem();
	return spawnTask(ctx, "asyncExists", async () => {
		try { return intVal((await fs.exists(r0.value)) ? 1 : 0); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleSleep(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 1) return errorVal(ErrorCodes.ArityError, "sleep requires 1 argument (milliseconds)");
	const ms = args[0];
	if (ms?.kind !== "int") return errorVal(ErrorCodes.TypeError, "sleep milliseconds must be an integer");
	return spawnTask(ctx, "sleep", async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, ms.value));
		return voidVal();
	});
}

function handleHttpGet(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 1) return errorVal(ErrorCodes.ArityError, "httpGet requires 1 argument (url)");
	const r0 = extractStringArg(args, 0, "httpGet url");
	if (isExtractError(r0)) return r0.error;
	const http = ctx.config.httpClient ?? new MockHttpClient();
	return spawnTask(ctx, "httpGet", async () => {
		try { return stringVal(await http.get(r0.value)); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

function handleHttpPost(ctx: AsyncEffectContext, args: Value[]): Value {
	if (args.length < 2) return errorVal(ErrorCodes.ArityError, "httpPost requires 2 arguments (url, body)");
	const r0 = extractStringArg(args, 0, "httpPost url");
	if (isExtractError(r0)) return r0.error;
	const r1 = extractStringArg(args, 1, "httpPost body");
	if (isExtractError(r1)) return r1.error;
	const http = ctx.config.httpClient ?? new MockHttpClient();
	return spawnTask(ctx, "httpPost", async () => {
		try { return stringVal(await http.post(r0.value, r1.value)); }
		catch (e) { return errorVal(ErrorCodes.DomainError, String(e)); }
	});
}

type EffectHandler = (ctx: AsyncEffectContext, args: Value[]) => Value;

const EFFECT_HANDLERS: Record<string, EffectHandler> = {
	asyncRead: handleAsyncRead,
	asyncWrite: handleAsyncWrite,
	asyncAppend: handleAsyncAppend,
	asyncDelete: handleAsyncDelete,
	asyncExists: handleAsyncExists,
	sleep: handleSleep,
	httpGet: handleHttpGet,
	httpPost: handleHttpPost,
};

/**
 * Evaluate an async effect with access to AsyncEvalState
 * This function handles async effects that need the scheduler and file system
 */
export function evalAsyncEffect(ctx: AsyncEffectContext, args: Value[]): Value {
	const handler = EFFECT_HANDLERS[ctx.effectName];
	if (!handler) {
		return errorVal(ErrorCodes.UnknownOperator, `Unknown async effect: ${ctx.effectName}`);
	}
	return handler(ctx, args);
}

//==============================================================================
// Factory Functions
//==============================================================================

export function createAsyncEffectRegistry(config?: AsyncIOEffectConfig): AsyncIOEffectRegistry {
	return new AsyncIOEffectRegistry(config);
}

export function createInMemoryFileSystem(): InMemoryFileSystem {
	return new InMemoryFileSystem();
}

export function createMockHttpClient(): MockHttpClient {
	return new MockHttpClient();
}

export function createAsyncIOConfig(config?: AsyncIOEffectConfig): AsyncIOEffectConfig {
	return {
		fileSystem: config?.fileSystem ?? new InMemoryFileSystem(),
		httpClient: config?.httpClient ?? new MockHttpClient(),
	};
}
