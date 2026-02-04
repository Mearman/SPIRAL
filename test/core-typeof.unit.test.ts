// SPIRAL core:typeof - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createKernelRegistry } from "../src/stdlib/kernel.ts";
import { lookupOperator } from "../src/domains/registry.ts";
import {
	intVal,
	stringVal,
	boolVal,
	floatVal,
	listVal,
	mapVal,
	voidVal,
	errorVal,
} from "../src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registry = createKernelRegistry();

function op(name: string) {
	const operator = lookupOperator(registry, "core", name);
	if (!operator) throw new Error(`Operator core:${name} not found`);
	return operator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("core:typeof", () => {
	it("returns 'int' for integer values", () => {
		assert.deepStrictEqual(op("typeof").fn(intVal(42)), stringVal("int"));
	});

	it("returns 'string' for string values", () => {
		assert.deepStrictEqual(op("typeof").fn(stringVal("x")), stringVal("string"));
	});

	it("returns 'bool' for boolean values", () => {
		assert.deepStrictEqual(op("typeof").fn(boolVal(true)), stringVal("bool"));
	});

	it("returns 'float' for float values", () => {
		assert.deepStrictEqual(op("typeof").fn(floatVal(3.14)), stringVal("float"));
	});

	it("returns 'list' for list values", () => {
		assert.deepStrictEqual(op("typeof").fn(listVal([])), stringVal("list"));
	});

	it("returns 'map' for map values", () => {
		assert.deepStrictEqual(op("typeof").fn(mapVal(new Map())), stringVal("map"));
	});

	it("returns 'void' for void values", () => {
		assert.deepStrictEqual(op("typeof").fn(voidVal()), stringVal("void"));
	});

	it("propagates error argument", () => {
		const err = errorVal("TestError", "test");
		const result = op("typeof").fn(err);
		assert.equal(result.kind, "error");
	});
});
