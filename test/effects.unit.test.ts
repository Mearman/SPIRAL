import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	emptyEffectRegistry,
	registerEffect,
	lookupEffect,
	ioEffects,
	stateEffects,
	createDefaultEffectRegistry,
	createQueuedEffectRegistry,
	type EffectOp,
} from "../src/effects.ts";
import { intVal, stringVal } from "../src/types.ts";

describe("effects", () => {
	// =========================================================================
	// 1. Registry operations
	// =========================================================================
	describe("registry operations", () => {
		it("emptyEffectRegistry returns empty Map", () => {
			const registry = emptyEffectRegistry();
			assert.equal(registry.size, 0);
		});

		it("registerEffect + lookupEffect round-trips an op", () => {
			let registry = emptyEffectRegistry();
			const op: EffectOp = {
				name: "testOp",
				params: [],
				returns: { kind: "void" },
				pure: true,
				fn: () => ({ kind: "void" }),
			};
			registry = registerEffect(registry, op);
			const found = lookupEffect(registry, "testOp");
			assert.notEqual(found, undefined);
			assert.equal(found!.name, "testOp");
		});

		it("lookupEffect returns undefined for unknown name", () => {
			const registry = emptyEffectRegistry();
			assert.equal(lookupEffect(registry, "nonexistent"), undefined);
		});
	});

	// =========================================================================
	// 2. ioEffects array
	// =========================================================================
	describe("ioEffects", () => {
		it("has 4 effects: print, printInt, readLine, readInt", () => {
			assert.equal(ioEffects.length, 4);
			const names = ioEffects.map((op) => op.name);
			assert.deepEqual(names, ["print", "printInt", "readLine", "readInt"]);
		});

		describe("print", () => {
			const print = ioEffects.find((op) => op.name === "print")!;

			it("returns void when called with a string arg", () => {
				const result = print.fn(stringVal("hello"));
				assert.deepEqual(result, { kind: "void" });
			});

			it("returns ArityError when called with no args", () => {
				const result = print.fn();
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("printInt", () => {
			const printInt = ioEffects.find((op) => op.name === "printInt")!;

			it("returns void when called with an int arg", () => {
				const result = printInt.fn(intVal(42));
				assert.deepEqual(result, { kind: "void" });
			});

			it("returns ArityError when called with no args", () => {
				const result = printInt.fn();
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("readLine", () => {
			const readLine = ioEffects.find((op) => op.name === "readLine")!;

			it("returns empty string when called with no args", () => {
				const result = readLine.fn();
				assert.deepEqual(result, { kind: "string", value: "" });
			});

			it("returns ArityError when called with extra args", () => {
				const result = readLine.fn(stringVal("x"));
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("readInt", () => {
			const readInt = ioEffects.find((op) => op.name === "readInt")!;

			it("returns int 0 when called with no args", () => {
				const result = readInt.fn();
				assert.deepEqual(result, { kind: "int", value: 0 });
			});

			it("returns ArityError when called with extra args", () => {
				const result = readInt.fn(intVal(1));
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});
	});

	// =========================================================================
	// 3. stateEffects array
	// =========================================================================
	describe("stateEffects", () => {
		it("has 2 effects: getState, setState", () => {
			assert.equal(stateEffects.length, 2);
			const names = stateEffects.map((op) => op.name);
			assert.deepEqual(names, ["getState", "setState"]);
		});

		describe("getState", () => {
			const getState = stateEffects.find((op) => op.name === "getState")!;

			it("returns mock-state string when called with no args", () => {
				const result = getState.fn();
				assert.deepEqual(result, { kind: "string", value: "mock-state" });
			});

			it("returns ArityError when called with extra args", () => {
				const result = getState.fn(stringVal("x"));
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("setState", () => {
			const setState = stateEffects.find((op) => op.name === "setState")!;

			it("returns void when called with a string arg", () => {
				const result = setState.fn(stringVal("new"));
				assert.deepEqual(result, { kind: "void" });
			});

			it("returns ArityError when called with no args", () => {
				const result = setState.fn();
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});
	});

	// =========================================================================
	// 4. createDefaultEffectRegistry
	// =========================================================================
	describe("createDefaultEffectRegistry", () => {
		const registry = createDefaultEffectRegistry();

		it("contains all 6 built-in effects", () => {
			assert.equal(registry.size, 6);
		});

		for (const name of ["print", "printInt", "readLine", "readInt", "getState", "setState"]) {
			it(`contains ${name}`, () => {
				assert.notEqual(lookupEffect(registry, name), undefined);
			});
		}
	});

	// =========================================================================
	// 5. createQueuedEffectRegistry
	// =========================================================================
	describe("createQueuedEffectRegistry", () => {
		describe("print (queued)", () => {
			const registry = createQueuedEffectRegistry([]);

			it("returns void when called with a string arg", () => {
				const result = lookupEffect(registry, "print")!.fn(stringVal("hello"));
				assert.deepEqual(result, { kind: "void" });
			});

			it("returns ArityError when called with no args", () => {
				const result = lookupEffect(registry, "print")!.fn();
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("printInt (queued)", () => {
			const registry = createQueuedEffectRegistry([]);

			it("returns void when called with an int arg", () => {
				const result = lookupEffect(registry, "printInt")!.fn(intVal(42));
				assert.deepEqual(result, { kind: "void" });
			});

			it("returns ArityError when called with no args", () => {
				const result = lookupEffect(registry, "printInt")!.fn();
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("readLine (queued)", () => {
			it("dequeues string inputs in order", () => {
				const registry = createQueuedEffectRegistry(["hello", "world"]);
				const readLine = lookupEffect(registry, "readLine")!;
				assert.deepEqual(readLine.fn(), stringVal("hello"));
				assert.deepEqual(readLine.fn(), stringVal("world"));
			});

			it("returns empty string when queue is exhausted", () => {
				const registry = createQueuedEffectRegistry([]);
				const result = lookupEffect(registry, "readLine")!.fn();
				assert.deepEqual(result, stringVal(""));
			});

			it("converts number input to string", () => {
				const registry = createQueuedEffectRegistry([42]);
				const result = lookupEffect(registry, "readLine")!.fn();
				assert.deepEqual(result, stringVal("42"));
			});

			it("returns ArityError when called with extra args", () => {
				const registry = createQueuedEffectRegistry([]);
				const result = lookupEffect(registry, "readLine")!.fn(stringVal("x"));
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("readInt (queued)", () => {
			it("dequeues number inputs in order", () => {
				const registry = createQueuedEffectRegistry([42, 99]);
				const readInt = lookupEffect(registry, "readInt")!;
				assert.deepEqual(readInt.fn(), intVal(42));
				assert.deepEqual(readInt.fn(), intVal(99));
			});

			it("returns int 0 when queue is exhausted", () => {
				const registry = createQueuedEffectRegistry([]);
				const result = lookupEffect(registry, "readInt")!.fn();
				assert.deepEqual(result, intVal(0));
			});

			it("returns int 0 for NaN input", () => {
				const registry = createQueuedEffectRegistry(["abc"]);
				const result = lookupEffect(registry, "readInt")!.fn();
				assert.deepEqual(result, intVal(0));
			});

			it("parses string number to int", () => {
				const registry = createQueuedEffectRegistry(["123"]);
				const result = lookupEffect(registry, "readInt")!.fn();
				assert.deepEqual(result, intVal(123));
			});

			it("returns ArityError when called with extra args", () => {
				const registry = createQueuedEffectRegistry([]);
				const result = lookupEffect(registry, "readInt")!.fn(intVal(1));
				assert.equal(result.kind, "error");
				assert.equal((result as { kind: "error"; code: string }).code, "ArityError");
			});
		});

		describe("state effects included", () => {
			const registry = createQueuedEffectRegistry([]);

			it("contains getState", () => {
				assert.notEqual(lookupEffect(registry, "getState"), undefined);
			});

			it("contains setState", () => {
				assert.notEqual(lookupEffect(registry, "setState"), undefined);
			});
		});
	});
});
