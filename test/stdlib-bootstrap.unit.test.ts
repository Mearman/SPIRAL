// SPIRAL Stdlib Bootstrap - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import { loadStdlib } from "../src/stdlib/loader.js";
import { lookupOperator } from "../src/domains/registry.js";
import { boolVal, floatVal, intVal, listVal, mapVal, setVal, stringVal, hashValue, voidVal } from "../src/types.js";
import type { Value } from "../src/types.js";

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
		assert.ok(lookupOperator(kernel, "map", "keys"));
	});

	it("has string primitives", () => {
		assert.ok(lookupOperator(kernel, "string", "concat"));
		assert.ok(lookupOperator(kernel, "string", "length"));
		assert.ok(lookupOperator(kernel, "string", "charAt"));
	});

	it("has set primitives", () => {
		assert.ok(lookupOperator(kernel, "set", "add"));
		assert.ok(lookupOperator(kernel, "set", "remove"));
		assert.ok(lookupOperator(kernel, "set", "contains"));
		assert.ok(lookupOperator(kernel, "set", "size"));
		assert.ok(lookupOperator(kernel, "set", "toList"));
	});

	it("does NOT have derived operators", () => {
		assert.strictEqual(lookupOperator(kernel, "bool", "and"), undefined);
		assert.strictEqual(lookupOperator(kernel, "bool", "or"), undefined);
		assert.strictEqual(lookupOperator(kernel, "bool", "xor"), undefined);
	});

	it("has core:isError", () => {
		const isErr = lookupOperator(kernel, "core", "isError");
		assert.ok(isErr);
		assert.deepStrictEqual(isErr.fn(intVal(1)), boolVal(false));
		assert.deepStrictEqual(isErr.fn({ kind: "error", code: "TestError", message: "test" } as Value), boolVal(true));
	});

	it("has string:toInt", () => {
		const toInt = lookupOperator(kernel, "string", "toInt");
		assert.ok(toInt);
		assert.deepStrictEqual(toInt.fn(stringVal("42")), intVal(42));
		assert.equal(toInt.fn(stringVal("abc")).kind, "error");
	});

	it("has string:toFloat", () => {
		const toFloat = lookupOperator(kernel, "string", "toFloat");
		assert.ok(toFloat);
		assert.deepStrictEqual(toFloat.fn(stringVal("3.14")), floatVal(3.14));
		assert.equal(toFloat.fn(stringVal("abc")).kind, "error");
	});

	it("has json:parse", () => {
		const parse = lookupOperator(kernel, "json", "parse");
		assert.ok(parse);
		// Parse number
		assert.deepStrictEqual(parse.fn(stringVal("42")), intVal(42));
		// Parse string
		assert.deepStrictEqual(parse.fn(stringVal('"hello"')), stringVal("hello"));
		// Parse boolean
		assert.deepStrictEqual(parse.fn(stringVal("true")), boolVal(true));
		// Parse null
		assert.deepStrictEqual(parse.fn(stringVal("null")), voidVal());
		// Parse array
		assert.deepStrictEqual(parse.fn(stringVal("[1,2,3]")), listVal([intVal(1), intVal(2), intVal(3)]));
		// Parse object
		const obj = parse.fn(stringVal('{"a":1}'));
		assert.equal(obj.kind, "map");
		// Parse error
		assert.equal(parse.fn(stringVal("{invalid")).kind, "error");
	});

	it("has 37 total operators", () => {
		assert.strictEqual(kernel.size, 37);
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

	it("list:take returns first n elements", () => {
		const take = lookupOperator(registry, "list", "take")!;
		const a = listVal([intVal(10), intVal(20), intVal(30), intVal(40)]);
		assert.deepStrictEqual(take.fn(a, intVal(2)), listVal([intVal(10), intVal(20)]));
	});

	it("list:take with n > length returns full list", () => {
		const take = lookupOperator(registry, "list", "take")!;
		const a = listVal([intVal(1), intVal(2)]);
		assert.deepStrictEqual(take.fn(a, intVal(10)), listVal([intVal(1), intVal(2)]));
	});

	it("list:take with n=0 returns empty", () => {
		const take = lookupOperator(registry, "list", "take")!;
		const a = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(take.fn(a, intVal(0)), listVal([]));
	});

	it("list:drop skips first n elements", () => {
		const drop = lookupOperator(registry, "list", "drop")!;
		const a = listVal([intVal(10), intVal(20), intVal(30), intVal(40)]);
		assert.deepStrictEqual(drop.fn(a, intVal(2)), listVal([intVal(30), intVal(40)]));
	});

	it("list:drop with n > length returns empty", () => {
		const drop = lookupOperator(registry, "list", "drop")!;
		const a = listVal([intVal(1), intVal(2)]);
		assert.deepStrictEqual(drop.fn(a, intVal(10)), listVal([]));
	});

	it("list:drop with n=0 returns full list", () => {
		const drop = lookupOperator(registry, "list", "drop")!;
		const a = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(drop.fn(a, intVal(0)), a);
	});

	it("list:range produces integer range", () => {
		const range = lookupOperator(registry, "list", "range")!;
		assert.deepStrictEqual(range.fn(intVal(0), intVal(5)), listVal([intVal(0), intVal(1), intVal(2), intVal(3), intVal(4)]));
	});

	it("list:range with start=end returns empty", () => {
		const range = lookupOperator(registry, "list", "range")!;
		assert.deepStrictEqual(range.fn(intVal(3), intVal(3)), listVal([]));
	});

	it("list:range with start > end returns empty", () => {
		const range = lookupOperator(registry, "list", "range")!;
		assert.deepStrictEqual(range.fn(intVal(5), intVal(2)), listVal([]));
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

describe("map stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
	]);

	function makeMap(entries: [string, Value][]): Value {
		return mapVal(new Map(entries.map(([k, v]) => ["s:" + k, v])));
	}
	const emptyMap = mapVal(new Map());

	// size
	it("map:size returns 0 for empty map", () => {
		const size = lookupOperator(registry, "map", "size")!;
		assert.deepStrictEqual(size.fn(emptyMap), intVal(0));
	});

	it("map:size returns correct count", () => {
		const size = lookupOperator(registry, "map", "size")!;
		const m = makeMap([["a", intVal(1)], ["b", intVal(2)], ["c", intVal(3)]]);
		assert.deepStrictEqual(size.fn(m), intVal(3));
	});

	// values
	it("map:values returns list of values", () => {
		const values = lookupOperator(registry, "map", "values")!;
		const m = makeMap([["a", intVal(1)], ["b", intVal(2)]]);
		const result = values.fn(m);
		assert.strictEqual(result.kind, "list");
		if (result.kind === "list") {
			assert.strictEqual(result.value.length, 2);
		}
	});

	it("map:values returns empty list for empty map", () => {
		const values = lookupOperator(registry, "map", "values")!;
		assert.deepStrictEqual(values.fn(emptyMap), listVal([]));
	});

	// entries
	it("map:entries returns list of [key, value] pairs", () => {
		const entries = lookupOperator(registry, "map", "entries")!;
		const m = makeMap([["a", intVal(1)], ["b", intVal(2)]]);
		const result = entries.fn(m);
		assert.strictEqual(result.kind, "list");
		if (result.kind === "list") {
			assert.strictEqual(result.value.length, 2);
			const pairs = result.value.map((pair) => {
				assert.strictEqual(pair.kind, "list");
				if (pair.kind === "list") {
					return [
						pair.value[0]?.kind === "string" ? pair.value[0].value : "?",
						pair.value[1]?.kind === "int" ? pair.value[1].value : -1,
					];
				}
				return null;
			});
			const sorted = pairs.sort((a, b) => String(a![0]).localeCompare(String(b![0])));
			assert.deepStrictEqual(sorted, [["a", 1], ["b", 2]]);
		}
	});

	it("map:entries returns empty list for empty map", () => {
		const entries = lookupOperator(registry, "map", "entries")!;
		assert.deepStrictEqual(entries.fn(emptyMap), listVal([]));
	});

	// remove
	it("map:remove removes existing key", () => {
		const remove = lookupOperator(registry, "map", "remove")!;
		const m = makeMap([["x", intVal(1)], ["y", intVal(2)]]);
		const result = remove.fn(m, stringVal("x"));
		assert.strictEqual(result.kind, "map");
		if (result.kind === "map") {
			assert.strictEqual(result.value.size, 1);
			assert.strictEqual(result.value.has("s:x"), false);
			assert.deepStrictEqual(result.value.get("s:y"), intVal(2));
		}
	});

	it("map:remove is no-op for missing key", () => {
		const remove = lookupOperator(registry, "map", "remove")!;
		const m = makeMap([["x", intVal(1)]]);
		const result = remove.fn(m, stringVal("z"));
		assert.strictEqual(result.kind, "map");
		if (result.kind === "map") {
			assert.strictEqual(result.value.size, 1);
		}
	});

	// merge
	it("map:merge merges two maps with right precedence", () => {
		const merge = lookupOperator(registry, "map", "merge")!;
		const a = makeMap([["x", intVal(1)], ["y", intVal(2)]]);
		const b = makeMap([["y", intVal(99)], ["z", intVal(3)]]);
		const result = merge.fn(a, b);
		assert.strictEqual(result.kind, "map");
		if (result.kind === "map") {
			assert.strictEqual(result.value.size, 3);
			assert.deepStrictEqual(result.value.get("s:y"), intVal(99));
			assert.deepStrictEqual(result.value.get("s:z"), intVal(3));
		}
	});

	it("map:merge with empty map", () => {
		const merge = lookupOperator(registry, "map", "merge")!;
		const m = makeMap([["x", intVal(1)]]);
		const result = merge.fn(m, emptyMap);
		assert.strictEqual(result.kind, "map");
		if (result.kind === "map") {
			assert.strictEqual(result.value.size, 1);
		}
	});
});

describe("set stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
	]);

	function makeSet(...vals: Value[]): Value {
		return setVal(new Set(vals.map(hashValue)));
	}
	const emptySet = setVal(new Set<string>());

	// union
	it("set:union returns union of disjoint sets", () => {
		const union = lookupOperator(registry, "set", "union")!;
		const a = makeSet(intVal(1), intVal(2));
		const b = makeSet(intVal(3), intVal(4));
		const result = union.fn(a, b);
		assert.strictEqual(result.kind, "set");
		if (result.kind === "set") {
			assert.strictEqual(result.value.size, 4);
		}
	});

	it("set:union deduplicates overlapping elements", () => {
		const union = lookupOperator(registry, "set", "union")!;
		const a = makeSet(intVal(1), intVal(2), intVal(3));
		const b = makeSet(intVal(2), intVal(3), intVal(4));
		const result = union.fn(a, b);
		assert.strictEqual(result.kind, "set");
		if (result.kind === "set") {
			assert.strictEqual(result.value.size, 4);
		}
	});

	it("set:union with empty set", () => {
		const union = lookupOperator(registry, "set", "union")!;
		const a = makeSet(intVal(1), intVal(2));
		const result = union.fn(a, emptySet);
		assert.strictEqual(result.kind, "set");
		if (result.kind === "set") {
			assert.strictEqual(result.value.size, 2);
		}
	});

	// intersect
	it("set:intersect returns common elements", () => {
		const intersect = lookupOperator(registry, "set", "intersect")!;
		const a = makeSet(intVal(1), intVal(2), intVal(3));
		const b = makeSet(intVal(2), intVal(3), intVal(4));
		const result = intersect.fn(a, b);
		assert.strictEqual(result.kind, "set");
		if (result.kind === "set") {
			assert.strictEqual(result.value.size, 2);
			assert.ok(result.value.has(hashValue(intVal(2))));
			assert.ok(result.value.has(hashValue(intVal(3))));
		}
	});

	it("set:intersect returns empty for disjoint sets", () => {
		const intersect = lookupOperator(registry, "set", "intersect")!;
		const a = makeSet(intVal(1), intVal(2));
		const b = makeSet(intVal(3), intVal(4));
		const result = intersect.fn(a, b);
		assert.deepStrictEqual(result, emptySet);
	});

	// difference
	it("set:difference returns elements in a not in b", () => {
		const difference = lookupOperator(registry, "set", "difference")!;
		const a = makeSet(intVal(1), intVal(2), intVal(3));
		const b = makeSet(intVal(2), intVal(3), intVal(4));
		const result = difference.fn(a, b);
		assert.strictEqual(result.kind, "set");
		if (result.kind === "set") {
			assert.strictEqual(result.value.size, 1);
			assert.ok(result.value.has(hashValue(intVal(1))));
		}
	});

	it("set:difference returns empty when sets are equal", () => {
		const difference = lookupOperator(registry, "set", "difference")!;
		const a = makeSet(intVal(1), intVal(2));
		const b = makeSet(intVal(1), intVal(2));
		const result = difference.fn(a, b);
		assert.deepStrictEqual(result, emptySet);
	});

	// subset
	it("set:subset returns true for proper subset", () => {
		const subset = lookupOperator(registry, "set", "subset")!;
		const a = makeSet(intVal(1), intVal(2));
		const b = makeSet(intVal(1), intVal(2), intVal(3));
		assert.deepStrictEqual(subset.fn(a, b), boolVal(true));
	});

	it("set:subset returns true for equal sets", () => {
		const subset = lookupOperator(registry, "set", "subset")!;
		const a = makeSet(intVal(1), intVal(2));
		const b = makeSet(intVal(1), intVal(2));
		assert.deepStrictEqual(subset.fn(a, b), boolVal(true));
	});

	it("set:subset returns false for partial overlap", () => {
		const subset = lookupOperator(registry, "set", "subset")!;
		const a = makeSet(intVal(1), intVal(2), intVal(3));
		const b = makeSet(intVal(2), intVal(3));
		assert.deepStrictEqual(subset.fn(a, b), boolVal(false));
	});

	it("set:subset returns true for empty subset", () => {
		const subset = lookupOperator(registry, "set", "subset")!;
		const b = makeSet(intVal(1), intVal(2));
		assert.deepStrictEqual(subset.fn(emptySet, b), boolVal(true));
	});
});

describe("meta stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "meta.cir.json"),
	]);

	function makeDoc(nodes: Value[], result: string): Value {
		return mapVal(new Map([
			["s:nodes", listVal(nodes)],
			["s:result", stringVal(result)],
		]));
	}

	function makeNode(id: string, expr: Value): Value {
		return mapVal(new Map([
			["s:id", stringVal(id)],
			["s:expr", expr],
		]));
	}

	function litExpr(value: number): Value {
		return mapVal(new Map([
			["s:kind", stringVal("lit")],
			["s:value", intVal(value)],
		]));
	}

	function callExpr(ns: string, name: string, args: string[]): Value {
		return mapVal(new Map([
			["s:kind", stringVal("call")],
			["s:ns", stringVal(ns)],
			["s:name", stringVal(name)],
			["s:args", listVal(args.map(stringVal))],
		]));
	}

	it("meta:eval evaluates simple addition (10 + 20 = 30)", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("a", litExpr(10)),
			makeNode("b", litExpr(20)),
			makeNode("sum", callExpr("core", "add", ["a", "b"])),
		], "sum");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(30));
	});

	it("meta:eval evaluates nested arithmetic", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("x", litExpr(3)),
			makeNode("y", litExpr(4)),
			makeNode("prod", callExpr("core", "mul", ["x", "y"])),
			makeNode("z", litExpr(2)),
			makeNode("r", callExpr("core", "add", ["prod", "z"])),
		], "r");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(14));
	});

	it("meta:eval evaluates if expression", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const ifExpr = mapVal(new Map([
			["s:kind", stringVal("if")],
			["s:cond", stringVal("cond")],
			["s:then", stringVal("a")],
			["s:else", stringVal("b")],
		]));
		const doc = makeDoc([
			makeNode("a", litExpr(1)),
			makeNode("b", litExpr(2)),
			makeNode("cond", callExpr("core", "gt", ["a", "b"])),
			makeNode("r", ifExpr),
		], "r");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(2));
	});
});
