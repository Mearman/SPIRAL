// SPIRAL Stdlib Bootstrap - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import { loadStdlib } from "../src/stdlib/loader.js";
import { lookupOperator } from "../src/domains/registry.js";
import { boolVal, intVal, listVal, stringVal } from "../src/types.js";

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

describe("list stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
	]);

	it("loads list:concat as a SPIRAL-defined operator", () => {
		assert.ok(lookupOperator(registry, "list", "concat"));
	});

	it("loads list:reverse as a SPIRAL-defined operator", () => {
		assert.ok(lookupOperator(registry, "list", "reverse"));
	});

	it("loads list:slice as a SPIRAL-defined operator", () => {
		assert.ok(lookupOperator(registry, "list", "slice"));
	});

	it("list:concat works correctly", () => {
		const concat = lookupOperator(registry, "list", "concat")!;
		const a = listVal([intVal(1), intVal(2), intVal(3)]);
		const b = listVal([intVal(4), intVal(5)]);
		assert.deepStrictEqual(concat.fn(a, b), listVal([intVal(1), intVal(2), intVal(3), intVal(4), intVal(5)]));
	});

	it("list:concat with empty lists", () => {
		const concat = lookupOperator(registry, "list", "concat")!;
		const a = listVal([intVal(1), intVal(2)]);
		const empty = listVal([]);
		assert.deepStrictEqual(concat.fn(a, empty), a);
		assert.deepStrictEqual(concat.fn(empty, a), a);
		assert.deepStrictEqual(concat.fn(empty, empty), empty);
	});

	it("list:reverse works correctly", () => {
		const reverse = lookupOperator(registry, "list", "reverse")!;
		const a = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(reverse.fn(a), listVal([intVal(3), intVal(2), intVal(1)]));
	});

	it("list:reverse empty list", () => {
		const reverse = lookupOperator(registry, "list", "reverse")!;
		assert.deepStrictEqual(reverse.fn(listVal([])), listVal([]));
	});

	it("list:slice works correctly", () => {
		const slice = lookupOperator(registry, "list", "slice")!;
		const a = listVal([intVal(10), intVal(20), intVal(30), intVal(40)]);
		assert.deepStrictEqual(slice.fn(a, intVal(1)), listVal([intVal(20), intVal(30), intVal(40)]));
		assert.deepStrictEqual(slice.fn(a, intVal(2)), listVal([intVal(30), intVal(40)]));
		assert.deepStrictEqual(slice.fn(a, intVal(0)), a);
	});

	it("list:slice past end returns empty", () => {
		const slice = lookupOperator(registry, "list", "slice")!;
		const a = listVal([intVal(1), intVal(2)]);
		assert.deepStrictEqual(slice.fn(a, intVal(5)), listVal([]));
	});
});

describe("string stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
	]);

	// slice
	it("string:slice extracts a substring by indices", () => {
		const slice = lookupOperator(registry, "string", "slice")!;
		assert.deepStrictEqual(slice.fn(stringVal("hello world"), intVal(0), intVal(5)), stringVal("hello"));
	});

	it("string:slice extracts middle portion", () => {
		const slice = lookupOperator(registry, "string", "slice")!;
		assert.deepStrictEqual(slice.fn(stringVal("abcdef"), intVal(2), intVal(4)), stringVal("cd"));
	});

	it("string:slice returns empty when start equals end", () => {
		const slice = lookupOperator(registry, "string", "slice")!;
		assert.deepStrictEqual(slice.fn(stringVal("abc"), intVal(1), intVal(1)), stringVal(""));
	});

	it("string:slice handles negative indices", () => {
		const slice = lookupOperator(registry, "string", "slice")!;
		assert.deepStrictEqual(slice.fn(stringVal("hello"), intVal(-3), intVal(-1)), stringVal("ll"));
	});

	it("string:slice returns empty for out-of-bounds start", () => {
		const slice = lookupOperator(registry, "string", "slice")!;
		assert.deepStrictEqual(slice.fn(stringVal("abc"), intVal(10), intVal(20)), stringVal(""));
	});

	// substring (same impl as slice)
	it("string:substring extracts a substring by indices", () => {
		const substring = lookupOperator(registry, "string", "substring")!;
		assert.deepStrictEqual(substring.fn(stringVal("hello world"), intVal(0), intVal(5)), stringVal("hello"));
	});

	it("string:substring handles out-of-bounds end index", () => {
		const substring = lookupOperator(registry, "string", "substring")!;
		assert.deepStrictEqual(substring.fn(stringVal("abc"), intVal(1), intVal(100)), stringVal("bc"));
	});

	// indexOf
	it("string:indexOf returns index of found substring", () => {
		const indexOf = lookupOperator(registry, "string", "indexOf")!;
		assert.deepStrictEqual(indexOf.fn(stringVal("hello world"), stringVal("world")), intVal(6));
	});

	it("string:indexOf returns -1 when not found", () => {
		const indexOf = lookupOperator(registry, "string", "indexOf")!;
		assert.deepStrictEqual(indexOf.fn(stringVal("hello"), stringVal("xyz")), intVal(-1));
	});

	it("string:indexOf returns 0 for empty search", () => {
		const indexOf = lookupOperator(registry, "string", "indexOf")!;
		assert.deepStrictEqual(indexOf.fn(stringVal("abc"), stringVal("")), intVal(0));
	});

	it("string:indexOf returns first occurrence", () => {
		const indexOf = lookupOperator(registry, "string", "indexOf")!;
		assert.deepStrictEqual(indexOf.fn(stringVal("abcabc"), stringVal("bc")), intVal(1));
	});

	// includes
	it("string:includes returns true when present", () => {
		const includes = lookupOperator(registry, "string", "includes")!;
		assert.deepStrictEqual(includes.fn(stringVal("hello world"), stringVal("world")), boolVal(true));
	});

	it("string:includes returns false when absent", () => {
		const includes = lookupOperator(registry, "string", "includes")!;
		assert.deepStrictEqual(includes.fn(stringVal("hello"), stringVal("xyz")), boolVal(false));
	});

	it("string:includes returns true for empty search", () => {
		const includes = lookupOperator(registry, "string", "includes")!;
		assert.deepStrictEqual(includes.fn(stringVal("abc"), stringVal("")), boolVal(true));
	});

	it("string:includes returns false for non-empty search in empty string", () => {
		const includes = lookupOperator(registry, "string", "includes")!;
		assert.deepStrictEqual(includes.fn(stringVal(""), stringVal("a")), boolVal(false));
	});

	// replace
	it("string:replace replaces first occurrence", () => {
		const replace = lookupOperator(registry, "string", "replace")!;
		assert.deepStrictEqual(replace.fn(stringVal("hello world"), stringVal("world"), stringVal("there")), stringVal("hello there"));
	});

	it("string:replace only replaces first occurrence", () => {
		const replace = lookupOperator(registry, "string", "replace")!;
		assert.deepStrictEqual(replace.fn(stringVal("abcabc"), stringVal("abc"), stringVal("x")), stringVal("xabc"));
	});

	it("string:replace returns original when not found", () => {
		const replace = lookupOperator(registry, "string", "replace")!;
		assert.deepStrictEqual(replace.fn(stringVal("hello"), stringVal("xyz"), stringVal("abc")), stringVal("hello"));
	});

	it("string:replace with empty replacement (deletion)", () => {
		const replace = lookupOperator(registry, "string", "replace")!;
		assert.deepStrictEqual(replace.fn(stringVal("hello world"), stringVal(" world"), stringVal("")), stringVal("hello"));
	});

	// split
	it("string:split by delimiter", () => {
		const split = lookupOperator(registry, "string", "split")!;
		assert.deepStrictEqual(split.fn(stringVal("a,b,c"), stringVal(",")), listVal([stringVal("a"), stringVal("b"), stringVal("c")]));
	});

	it("string:split returns single element when delimiter not found", () => {
		const split = lookupOperator(registry, "string", "split")!;
		assert.deepStrictEqual(split.fn(stringVal("hello"), stringVal(",")), listVal([stringVal("hello")]));
	});

	it("string:split empty string by non-empty delimiter", () => {
		const split = lookupOperator(registry, "string", "split")!;
		assert.deepStrictEqual(split.fn(stringVal(""), stringVal(",")), listVal([stringVal("")]));
	});

	it("string:split by multi-character delimiter", () => {
		const split = lookupOperator(registry, "string", "split")!;
		assert.deepStrictEqual(split.fn(stringVal("a::b::c"), stringVal("::")), listVal([stringVal("a"), stringVal("b"), stringVal("c")]));
	});

	// join
	it("string:join with separator", () => {
		const join = lookupOperator(registry, "string", "join")!;
		assert.deepStrictEqual(join.fn(listVal([stringVal("a"), stringVal("b"), stringVal("c")]), stringVal(",")), stringVal("a,b,c"));
	});

	it("string:join empty list", () => {
		const join = lookupOperator(registry, "string", "join")!;
		assert.deepStrictEqual(join.fn(listVal([]), stringVal(",")), stringVal(""));
	});

	it("string:join single element", () => {
		const join = lookupOperator(registry, "string", "join")!;
		assert.deepStrictEqual(join.fn(listVal([stringVal("x")]), stringVal("-")), stringVal("x"));
	});
});
