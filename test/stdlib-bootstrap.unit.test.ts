// SPIRAL Stdlib Bootstrap - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import { loadStdlib } from "../src/stdlib/loader.js";
import { lookupOperator } from "../src/domains/registry.js";
import { boolVal, intVal } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stdlibDir = resolve(__dirname, "../src/stdlib");

describe("kernel registry", () => {
	const kernel = createKernelRegistry();

	it("has core arithmetic operators", () => {
		const add = lookupOperator(kernel, "core", "add");
		assert.ok(add);
		assert.deepStrictEqual(add.fn(intVal(2), intVal(3)), intVal(5));
	});

	it("has core comparison operators", () => {
		const eq = lookupOperator(kernel, "core", "eq");
		assert.ok(eq);
		assert.deepStrictEqual(eq.fn(intVal(1), intVal(1)), boolVal(true));
	});

	it("has bool:not", () => {
		const not = lookupOperator(kernel, "bool", "not");
		assert.ok(not);
		assert.deepStrictEqual(not.fn(boolVal(true)), boolVal(false));
	});

	it("has list primitives", () => {
		assert.ok(lookupOperator(kernel, "list", "length"));
		assert.ok(lookupOperator(kernel, "list", "nth"));
		assert.ok(lookupOperator(kernel, "list", "cons"));
	});

	it("has map primitives", () => {
		assert.ok(lookupOperator(kernel, "map", "get"));
		assert.ok(lookupOperator(kernel, "map", "set"));
		assert.ok(lookupOperator(kernel, "map", "has"));
	});

	it("has string primitives", () => {
		assert.ok(lookupOperator(kernel, "string", "concat"));
		assert.ok(lookupOperator(kernel, "string", "length"));
		assert.ok(lookupOperator(kernel, "string", "charAt"));
	});

	it("does NOT have derived operators", () => {
		assert.strictEqual(lookupOperator(kernel, "bool", "and"), undefined);
		assert.strictEqual(lookupOperator(kernel, "bool", "or"), undefined);
		assert.strictEqual(lookupOperator(kernel, "bool", "xor"), undefined);
	});

	it("has 31 total operators", () => {
		assert.strictEqual(kernel.size, 31);
	});
});

describe("bool stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
	]);

	it("loads bool:and as a SPIRAL-defined operator", () => {
		const and = lookupOperator(registry, "bool", "and");
		assert.ok(and);
	});

	it("bool:and works correctly", () => {
		const and = lookupOperator(registry, "bool", "and")!;
		assert.deepStrictEqual(and.fn(boolVal(true), boolVal(true)), boolVal(true));
		assert.deepStrictEqual(and.fn(boolVal(true), boolVal(false)), boolVal(false));
		assert.deepStrictEqual(and.fn(boolVal(false), boolVal(true)), boolVal(false));
		assert.deepStrictEqual(and.fn(boolVal(false), boolVal(false)), boolVal(false));
	});

	it("bool:or works correctly", () => {
		const or = lookupOperator(registry, "bool", "or")!;
		assert.deepStrictEqual(or.fn(boolVal(true), boolVal(true)), boolVal(true));
		assert.deepStrictEqual(or.fn(boolVal(true), boolVal(false)), boolVal(true));
		assert.deepStrictEqual(or.fn(boolVal(false), boolVal(true)), boolVal(true));
		assert.deepStrictEqual(or.fn(boolVal(false), boolVal(false)), boolVal(false));
	});

	it("bool:xor works correctly", () => {
		const xor = lookupOperator(registry, "bool", "xor")!;
		assert.deepStrictEqual(xor.fn(boolVal(true), boolVal(true)), boolVal(false));
		assert.deepStrictEqual(xor.fn(boolVal(true), boolVal(false)), boolVal(true));
		assert.deepStrictEqual(xor.fn(boolVal(false), boolVal(true)), boolVal(true));
		assert.deepStrictEqual(xor.fn(boolVal(false), boolVal(false)), boolVal(false));
	});
});
