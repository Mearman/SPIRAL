// SPIRAL Stdlib Bootstrap - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import { loadStdlib } from "../src/stdlib/loader.js";
import { lookupOperator } from "../src/domains/registry.js";
import { boolVal, floatVal, intVal, listVal, mapVal, setVal, stringVal, hashValue, voidVal, closureVal } from "../src/types.js";
import type { Expr, LambdaParam } from "../src/types.js";
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
		assert.strictEqual(kernel.size, 39);
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

describe("core-derived stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "core-derived.cir.json"),
	]);

	it("core:abs returns absolute value of positive", () => {
		const abs = lookupOperator(registry, "core", "abs")!;
		assert.deepStrictEqual(abs.fn(intVal(5)), intVal(5));
	});

	it("core:abs returns absolute value of negative", () => {
		const abs = lookupOperator(registry, "core", "abs")!;
		assert.deepStrictEqual(abs.fn(intVal(-7)), intVal(7));
	});

	it("core:abs of zero is zero", () => {
		const abs = lookupOperator(registry, "core", "abs")!;
		assert.deepStrictEqual(abs.fn(intVal(0)), intVal(0));
	});

	it("core:min returns smaller value", () => {
		const min = lookupOperator(registry, "core", "min")!;
		assert.deepStrictEqual(min.fn(intVal(3), intVal(7)), intVal(3));
		assert.deepStrictEqual(min.fn(intVal(7), intVal(3)), intVal(3));
	});

	it("core:min with equal values", () => {
		const min = lookupOperator(registry, "core", "min")!;
		assert.deepStrictEqual(min.fn(intVal(5), intVal(5)), intVal(5));
	});

	it("core:max returns larger value", () => {
		const max = lookupOperator(registry, "core", "max")!;
		assert.deepStrictEqual(max.fn(intVal(3), intVal(7)), intVal(7));
		assert.deepStrictEqual(max.fn(intVal(7), intVal(3)), intVal(7));
	});

	it("core:max with equal values", () => {
		const max = lookupOperator(registry, "core", "max")!;
		assert.deepStrictEqual(max.fn(intVal(5), intVal(5)), intVal(5));
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

	it("string:startsWith returns true for matching prefix", () => {
		const startsWith = lookupOperator(registry, "string", "startsWith")!;
		assert.deepStrictEqual(startsWith.fn(stringVal("hello world"), stringVal("hello")), boolVal(true));
	});

	it("string:startsWith returns false for non-matching prefix", () => {
		const startsWith = lookupOperator(registry, "string", "startsWith")!;
		assert.deepStrictEqual(startsWith.fn(stringVal("hello"), stringVal("world")), boolVal(false));
	});

	it("string:startsWith returns true for empty prefix", () => {
		const startsWith = lookupOperator(registry, "string", "startsWith")!;
		assert.deepStrictEqual(startsWith.fn(stringVal("hello"), stringVal("")), boolVal(true));
	});

	it("string:startsWith returns false when prefix longer than string", () => {
		const startsWith = lookupOperator(registry, "string", "startsWith")!;
		assert.deepStrictEqual(startsWith.fn(stringVal("hi"), stringVal("hello")), boolVal(false));
	});

	it("string:endsWith returns true for matching suffix", () => {
		const endsWith = lookupOperator(registry, "string", "endsWith")!;
		assert.deepStrictEqual(endsWith.fn(stringVal("hello world"), stringVal("world")), boolVal(true));
	});

	it("string:endsWith returns false for non-matching suffix", () => {
		const endsWith = lookupOperator(registry, "string", "endsWith")!;
		assert.deepStrictEqual(endsWith.fn(stringVal("hello"), stringVal("world")), boolVal(false));
	});

	it("string:endsWith returns true for empty suffix", () => {
		const endsWith = lookupOperator(registry, "string", "endsWith")!;
		assert.deepStrictEqual(endsWith.fn(stringVal("hello"), stringVal("")), boolVal(true));
	});

	it("string:repeat repeats string n times", () => {
		const repeat = lookupOperator(registry, "string", "repeat")!;
		assert.deepStrictEqual(repeat.fn(stringVal("ab"), intVal(3)), stringVal("ababab"));
	});

	it("string:repeat with n=0 returns empty", () => {
		const repeat = lookupOperator(registry, "string", "repeat")!;
		assert.deepStrictEqual(repeat.fn(stringVal("hello"), intVal(0)), stringVal(""));
	});

	it("string:repeat with n=1 returns original", () => {
		const repeat = lookupOperator(registry, "string", "repeat")!;
		assert.deepStrictEqual(repeat.fn(stringVal("x"), intVal(1)), stringVal("x"));
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

describe("conversion stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "conversion.cir.json"),
	]);

	it("map:fromEntries builds map from key-value pairs", () => {
		const fromEntries = lookupOperator(registry, "map", "fromEntries")!;
		const entries = listVal([
			listVal([stringVal("a"), intVal(1)]),
			listVal([stringVal("b"), intVal(2)]),
		]);
		const result = fromEntries.fn(entries);
		const expected = mapVal(new Map([["s:a", intVal(1)], ["s:b", intVal(2)]]));
		assert.deepStrictEqual(result, expected);
	});

	it("map:fromEntries with empty list returns empty map", () => {
		const fromEntries = lookupOperator(registry, "map", "fromEntries")!;
		const result = fromEntries.fn(listVal([]));
		assert.deepStrictEqual(result, mapVal(new Map()));
	});

	it("map:fromEntries with duplicate keys keeps last", () => {
		const fromEntries = lookupOperator(registry, "map", "fromEntries")!;
		const entries = listVal([
			listVal([stringVal("x"), intVal(1)]),
			listVal([stringVal("x"), intVal(2)]),
		]);
		const result = fromEntries.fn(entries);
		assert.deepStrictEqual(result, mapVal(new Map([["s:x", intVal(2)]])));
	});
});

describe("list-hof stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "list-hof.cir.json"),
	]);

	// Helper: create a closure that doubles its argument
	const doubleClosure = closureVal(
		[{ name: "x", type: { kind: "int" } }] as LambdaParam[],
		{ kind: "call", ns: "core", name: "mul", args: [{ kind: "var", name: "x" }, { kind: "lit", type: { kind: "int" }, value: 2 }] } as Expr,
		null as never,
	);

	// Helper: closure that tests if x > 2
	const gtTwoClosure = closureVal(
		[{ name: "x", type: { kind: "int" } }] as LambdaParam[],
		{ kind: "call", ns: "core", name: "gt", args: [{ kind: "var", name: "x" }, { kind: "lit", type: { kind: "int" }, value: 2 }] } as Expr,
		null as never,
	);

	// Helper: closure that adds two numbers
	const addClosure = closureVal(
		[{ name: "a", type: { kind: "int" } }, { name: "b", type: { kind: "int" } }] as LambdaParam[],
		{ kind: "call", ns: "core", name: "add", args: [{ kind: "var", name: "a" }, { kind: "var", name: "b" }] } as Expr,
		null as never,
	);

	it("list:map applies function to each element", () => {
		const map = lookupOperator(registry, "list", "map")!;
		const lst = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(map.fn(lst, doubleClosure), listVal([intVal(2), intVal(4), intVal(6)]));
	});

	it("list:map on empty list returns empty", () => {
		const map = lookupOperator(registry, "list", "map")!;
		assert.deepStrictEqual(map.fn(listVal([]), doubleClosure), listVal([]));
	});

	it("list:filter keeps matching elements", () => {
		const filter = lookupOperator(registry, "list", "filter")!;
		const lst = listVal([intVal(1), intVal(2), intVal(3), intVal(4)]);
		assert.deepStrictEqual(filter.fn(lst, gtTwoClosure), listVal([intVal(3), intVal(4)]));
	});

	it("list:filter on empty list returns empty", () => {
		const filter = lookupOperator(registry, "list", "filter")!;
		assert.deepStrictEqual(filter.fn(listVal([]), gtTwoClosure), listVal([]));
	});

	it("list:filter with no matches returns empty", () => {
		const filter = lookupOperator(registry, "list", "filter")!;
		const lst = listVal([intVal(1), intVal(2)]);
		assert.deepStrictEqual(filter.fn(lst, gtTwoClosure), listVal([]));
	});

	it("list:fold accumulates over list", () => {
		const fold = lookupOperator(registry, "list", "fold")!;
		const lst = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(fold.fn(lst, intVal(0), addClosure), intVal(6));
	});

	it("list:fold on empty list returns init", () => {
		const fold = lookupOperator(registry, "list", "fold")!;
		assert.deepStrictEqual(fold.fn(listVal([]), intVal(42), addClosure), intVal(42));
	});

	it("list:reduce accumulates without init", () => {
		const reduce = lookupOperator(registry, "list", "reduce")!;
		const lst = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.deepStrictEqual(reduce.fn(lst, addClosure), intVal(6));
	});

	it("list:reduce single element returns that element", () => {
		const reduce = lookupOperator(registry, "list", "reduce")!;
		assert.deepStrictEqual(reduce.fn(listVal([intVal(7)]), addClosure), intVal(7));
	});
});

describe("validate stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "core-derived.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "conversion.cir.json"),
		resolve(stdlibDir, "list-hof.cir.json"),
		resolve(stdlibDir, "validate.cir.json"),
	]);

	// Helper: create a node map with s:-prefixed keys (matching kernel map conventions)
	function makeNodeMap(id: string, exprMap: Map<string, import("../src/types.js").Value>): import("../src/types.js").Value {
		return mapVal(new Map([
			["s:id", stringVal(id)],
			["s:expr", mapVal(exprMap)],
		]));
	}

	// Helper: create a lit expression map
	function litExprMap(value: number): Map<string, import("../src/types.js").Value> {
		return new Map([
			["s:kind", stringVal("lit")],
			["s:value", intVal(value)],
		]);
	}

	// Helper: create a call expression map (with string ref args)
	function callExprMap(ns: string, name: string, args: string[]): Map<string, import("../src/types.js").Value> {
		return new Map([
			["s:kind", stringVal("call")],
			["s:ns", stringVal(ns)],
			["s:name", stringVal(name)],
			["s:args", listVal(args.map(a => stringVal(a)))],
		]);
	}

	it("validate:checkDuplicateIds returns empty for unique IDs", () => {
		const check = lookupOperator(registry, "validate", "checkDuplicateIds")!;
		const nodes = listVal([
			makeNodeMap("a", litExprMap(1)),
			makeNodeMap("b", litExprMap(2)),
		]);
		const result = check.fn(nodes);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("validate:checkDuplicateIds detects duplicates", () => {
		const check = lookupOperator(registry, "validate", "checkDuplicateIds")!;
		const nodes = listVal([
			makeNodeMap("x", litExprMap(1)),
			makeNodeMap("x", litExprMap(2)),
		]);
		const result = check.fn(nodes);
		// Should return a non-empty list of error strings
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	it("validate:checkResult returns empty when result exists", () => {
		const check = lookupOperator(registry, "validate", "checkResult")!;
		const nodes = listVal([
			makeNodeMap("a", litExprMap(1)),
			makeNodeMap("b", litExprMap(2)),
		]);
		const result = check.fn(nodes, stringVal("b"));
		assert.deepStrictEqual(result, listVal([]));
	});

	it("validate:checkResult reports missing result", () => {
		const check = lookupOperator(registry, "validate", "checkResult")!;
		const nodes = listVal([
			makeNodeMap("a", litExprMap(1)),
		]);
		const result = check.fn(nodes, stringVal("missing"));
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	it("validate:collectDeps returns refs from call expression", () => {
		const collect = lookupOperator(registry, "validate", "collectDeps")!;
		const expr = mapVal(callExprMap("core", "add", ["x", "y"]));
		const result = collect.fn(expr);
		assert.ok(result.kind === "list");
		const deps = result.value.map(v => v.kind === "string" ? v.value : "");
		assert.ok(deps.includes("x"));
		assert.ok(deps.includes("y"));
	});

	it("validate:collectDeps returns empty for lit expression", () => {
		const collect = lookupOperator(registry, "validate", "collectDeps")!;
		const expr = mapVal(new Map([["s:kind", stringVal("lit")], ["s:value", intVal(42)]]));
		const result = collect.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("validate:validate returns valid for correct document", () => {
		const validate = lookupOperator(registry, "validate", "validate")!;
		const doc = mapVal(new Map([
			["s:nodes", listVal([
				makeNodeMap("a", litExprMap(10)),
				makeNodeMap("b", litExprMap(20)),
				makeNodeMap("sum", callExprMap("core", "add", ["a", "b"])),
			])],
			["s:result", stringVal("sum")],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === true);
	});

	it("validate:validate detects missing result node", () => {
		const validate = lookupOperator(registry, "validate", "validate")!;
		const doc = mapVal(new Map([
			["s:nodes", listVal([
				makeNodeMap("a", litExprMap(10)),
			])],
			["s:result", stringVal("missing")],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});
});

describe("schema stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "core-derived.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "conversion.cir.json"),
		resolve(stdlibDir, "list-hof.cir.json"),
		resolve(stdlibDir, "validate.cir.json"),
		resolve(stdlibDir, "schema.cir.json"),
	]);

	// Helper: build a valid CIR document as a SPIRAL map value
	function makeDoc(nodes: Value[], result: string): Value {
		return mapVal(new Map([
			["s:version", stringVal("1.0.0")],
			["s:airDefs", listVal([])],
			["s:nodes", listVal(nodes)],
			["s:result", stringVal(result)],
		]));
	}

	function makeNode(id: string, exprFields: [string, Value][]): Value {
		const exprMap = new Map<string, Value>(exprFields.map(([k, v]) => [`s:${k}`, v]));
		return mapVal(new Map([
			["s:id", stringVal(id)],
			["s:expr", mapVal(exprMap)],
		]));
	}

	function litNode(id: string, value: number): Value {
		return makeNode(id, [
			["kind", stringVal("lit")],
			["type", mapVal(new Map([["s:kind", stringVal("int")]]))],
			["value", intVal(value)],
		]);
	}

	function callNode(id: string, ns: string, name: string, args: string[]): Value {
		return makeNode(id, [
			["kind", stringVal("call")],
			["ns", stringVal(ns)],
			["name", stringVal(name)],
			["args", listVal(args.map(a => stringVal(a)))],
		]);
	}

	// --- schema:validate tests ---

	it("schema:validate accepts a valid CIR document", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		const doc = makeDoc([litNode("a", 10), litNode("b", 20), callNode("sum", "core", "add", ["a", "b"])], "sum");
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === true, `Expected valid=true, got ${JSON.stringify(valid)}`);
	});

	it("schema:validate rejects document missing version", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		const doc = mapVal(new Map([
			["s:airDefs", listVal([])],
			["s:nodes", listVal([litNode("a", 1)])],
			["s:result", stringVal("a")],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});

	it("schema:validate rejects document missing nodes", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		const doc = mapVal(new Map([
			["s:version", stringVal("1.0.0")],
			["s:airDefs", listVal([])],
			["s:result", stringVal("a")],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});

	it("schema:validate rejects document with empty nodes", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		const doc = makeDoc([], "a");
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});

	it("schema:validate rejects document missing result", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		const doc = mapVal(new Map([
			["s:version", stringVal("1.0.0")],
			["s:airDefs", listVal([])],
			["s:nodes", listVal([litNode("a", 1)])],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});

	// --- schema:validateNode tests ---

	it("schema:validateNode accepts valid lit node", () => {
		const validateNode = lookupOperator(registry, "schema", "validateNode")!;
		const result = validateNode.fn(litNode("a", 42));
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateNode rejects node missing id", () => {
		const validateNode = lookupOperator(registry, "schema", "validateNode")!;
		const node = mapVal(new Map([
			["s:expr", mapVal(new Map([["s:kind", stringVal("lit")], ["s:type", mapVal(new Map([["s:kind", stringVal("int")]]))], ["s:value", intVal(1)]]))],
		]));
		const result = validateNode.fn(node);
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	it("schema:validateNode rejects node missing expr", () => {
		const validateNode = lookupOperator(registry, "schema", "validateNode")!;
		const node = mapVal(new Map([["s:id", stringVal("a")]]));
		const result = validateNode.fn(node);
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	// --- schema:validateExpr tests ---

	it("schema:validateExpr accepts valid call expression", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("call")],
			["s:ns", stringVal("core")],
			["s:name", stringVal("add")],
			["s:args", listVal([stringVal("a"), stringVal("b")])],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateExpr rejects EIR kind", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([["s:kind", stringVal("spawn")]]));
		const result = validateExpr.fn(expr);
		assert.ok(result.kind === "list" && result.value.length > 0);
		// Error message should mention EIR
		const errMsg = result.value[0];
		assert.ok(errMsg.kind === "string" && errMsg.value.includes("EIR"));
	});

	it("schema:validateExpr rejects unknown kind", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([["s:kind", stringVal("banana")]]));
		const result = validateExpr.fn(expr);
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	it("schema:validateExpr validates lambda requires string body", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		// Lambda with map body (invalid — body must be string)
		const expr = mapVal(new Map([
			["s:kind", stringVal("lambda")],
			["s:params", listVal([stringVal("x")])],
			["s:body", mapVal(new Map([["s:kind", stringVal("lit")]]))],
			["s:type", mapVal(new Map([["s:kind", stringVal("fn")]]))],
		]));
		const result = validateExpr.fn(expr);
		assert.ok(result.kind === "list" && result.value.length > 0);
	});

	it("schema:validateExpr accepts valid lambda with string body", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("lambda")],
			["s:params", listVal([stringVal("x")])],
			["s:body", stringVal("bodyNode")],
			["s:type", mapVal(new Map([["s:kind", stringVal("fn")]]))],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateExpr validates ref requires id string", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("ref")],
			["s:id", stringVal("someNode")],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateExpr validates var requires name string", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("var")],
			["s:name", stringVal("x")],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateExpr validates if requires cond/then/else", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("if")],
			["s:cond", stringVal("c")],
			["s:then", stringVal("t")],
			["s:else", stringVal("e")],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validateExpr validates fix requires fn and type", () => {
		const validateExpr = lookupOperator(registry, "schema", "validateExpr")!;
		const expr = mapVal(new Map([
			["s:kind", stringVal("fix")],
			["s:fn", stringVal("recFn")],
			["s:type", mapVal(new Map([["s:kind", stringVal("fn")]]))],
		]));
		const result = validateExpr.fn(expr);
		assert.deepStrictEqual(result, listVal([]));
	});

	it("schema:validate accumulates multiple errors", () => {
		const validate = lookupOperator(registry, "schema", "validate")!;
		// Doc missing version AND result
		const doc = mapVal(new Map([
			["s:airDefs", listVal([])],
			["s:nodes", listVal([litNode("a", 1)])],
		]));
		const result = validate.fn(doc);
		assert.ok(result.kind === "map");
		const errors = result.value.get("s:errors");
		assert.ok(errors?.kind === "list" && errors.value.length >= 2);
	});
});

describe("parse stdlib", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "core-derived.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "conversion.cir.json"),
		resolve(stdlibDir, "list-hof.cir.json"),
		resolve(stdlibDir, "validate.cir.json"),
		resolve(stdlibDir, "schema.cir.json"),
		resolve(stdlibDir, "parse.cir.json"),
	]);

	it("parse:parse returns valid for correct CIR JSON", () => {
		const parse = lookupOperator(registry, "parse", "parse")!;
		const json = JSON.stringify({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{id: "a", expr: {kind: "lit", type: {kind: "int"}, value: 10}},
			],
			result: "a",
		});
		const result = parse.fn(stringVal(json));
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === true);
		const doc = result.value.get("s:doc");
		assert.ok(doc?.kind === "map");
	});

	it("parse:parse returns errors for invalid JSON", () => {
		const parse = lookupOperator(registry, "parse", "parse")!;
		const result = parse.fn(stringVal("{not valid json"));
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
		const errors = result.value.get("s:errors");
		assert.ok(errors?.kind === "list" && errors.value.length > 0);
	});

	it("parse:parse returns errors for non-object JSON", () => {
		const parse = lookupOperator(registry, "parse", "parse")!;
		const result = parse.fn(stringVal("[1,2,3]"));
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
	});

	it("parse:parse returns schema errors for invalid document", () => {
		const parse = lookupOperator(registry, "parse", "parse")!;
		const json = JSON.stringify({nodes: [], result: "a"});
		const result = parse.fn(stringVal(json));
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.ok(valid?.kind === "bool" && valid.value === false);
		const errors = result.value.get("s:errors");
		assert.ok(errors?.kind === "list" && errors.value.length > 0);
	});
});

describe("typecheck stdlib — type utilities", () => {
	const kernel = createKernelRegistry();
	const registry = loadStdlib(kernel, [
		resolve(stdlibDir, "bool.cir.json"),
		resolve(stdlibDir, "list.cir.json"),
		resolve(stdlibDir, "string.cir.json"),
		resolve(stdlibDir, "core-derived.cir.json"),
		resolve(stdlibDir, "map.cir.json"),
		resolve(stdlibDir, "set.cir.json"),
		resolve(stdlibDir, "conversion.cir.json"),
		resolve(stdlibDir, "list-hof.cir.json"),
		resolve(stdlibDir, "validate.cir.json"),
		resolve(stdlibDir, "schema.cir.json"),
		resolve(stdlibDir, "parse.cir.json"),
		resolve(stdlibDir, "typecheck.cir.json"),
	]);

	function makeType(kind: string): Value {
		return mapVal(new Map([["s:kind", stringVal(kind)]]));
	}

	function makeFnType(params: Value[], returns: Value): Value {
		return mapVal(new Map([
			["s:kind", stringVal("fn")],
			["s:params", listVal(params)],
			["s:returns", returns],
		]));
	}

	it("typecheck:typeEqual returns true for same primitive types", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		assert.deepStrictEqual(typeEqual.fn(makeType("int"), makeType("int")), boolVal(true));
		assert.deepStrictEqual(typeEqual.fn(makeType("bool"), makeType("bool")), boolVal(true));
		assert.deepStrictEqual(typeEqual.fn(makeType("string"), makeType("string")), boolVal(true));
	});

	it("typecheck:typeEqual returns false for different primitive types", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		assert.deepStrictEqual(typeEqual.fn(makeType("int"), makeType("bool")), boolVal(false));
		assert.deepStrictEqual(typeEqual.fn(makeType("string"), makeType("int")), boolVal(false));
	});

	it("typecheck:typeEqual returns true for same fn types", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		const fn1 = makeFnType([makeType("int"), makeType("int")], makeType("bool"));
		const fn2 = makeFnType([makeType("int"), makeType("int")], makeType("bool"));
		assert.deepStrictEqual(typeEqual.fn(fn1, fn2), boolVal(true));
	});

	it("typecheck:typeEqual returns false for fn types with different returns", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		const fn1 = makeFnType([makeType("int")], makeType("int"));
		const fn2 = makeFnType([makeType("int")], makeType("bool"));
		assert.deepStrictEqual(typeEqual.fn(fn1, fn2), boolVal(false));
	});

	it("typecheck:typeEqual returns false for fn types with different param count", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		const fn1 = makeFnType([makeType("int")], makeType("int"));
		const fn2 = makeFnType([makeType("int"), makeType("int")], makeType("int"));
		assert.deepStrictEqual(typeEqual.fn(fn1, fn2), boolVal(false));
	});

	it("typecheck:typeEqual returns false for fn vs primitive", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		const fn1 = makeFnType([makeType("int")], makeType("int"));
		assert.deepStrictEqual(typeEqual.fn(fn1, makeType("int")), boolVal(false));
	});

	it("typecheck:typeEqual handles nested fn types", () => {
		const typeEqual = lookupOperator(registry, "typecheck", "typeEqual")!;
		// fn(fn(int→bool)→string) vs fn(fn(int→bool)→string) — should be equal
		const inner1 = makeFnType([makeType("int")], makeType("bool"));
		const inner2 = makeFnType([makeType("int")], makeType("bool"));
		const outer1 = makeFnType([inner1], makeType("string"));
		const outer2 = makeFnType([inner2], makeType("string"));
		assert.deepStrictEqual(typeEqual.fn(outer1, outer2), boolVal(true));
	});

	// --- Bound node analysis ---

	function makeNodeVal(id: string, exprFields: [string, Value][]): Value {
		const exprMap = new Map<string, Value>(exprFields.map(([k, v]) => [`s:${k}`, v]));
		return mapVal(new Map([
			["s:id", stringVal(id)],
			["s:expr", mapVal(exprMap)],
		]));
	}

	it("typecheck:buildNodeMap builds map from node list", () => {
		const buildNodeMap = lookupOperator(registry, "typecheck", "buildNodeMap")!;
		const nodes = listVal([
			makeNodeVal("a", [["kind", stringVal("lit")], ["value", intVal(10)]]),
			makeNodeVal("b", [["kind", stringVal("lit")], ["value", intVal(20)]]),
		]);
		const result = buildNodeMap.fn(nodes);
		assert.ok(result.kind === "map");
		assert.ok(result.value.has("s:a"));
		assert.ok(result.value.has("s:b"));
	});

	it("typecheck:identifyBoundNodes finds lambda body nodes", () => {
		const identifyBoundNodes = lookupOperator(registry, "typecheck", "identifyBoundNodes")!;
		// A program: lit "five", call addFive, lambda addFiveLambda(body=addFive)
		const nodes = listVal([
			makeNodeVal("five", [["kind", stringVal("lit")], ["value", intVal(5)]]),
			makeNodeVal("addFive", [["kind", stringVal("call")], ["ns", stringVal("core")], ["name", stringVal("add")], ["args", listVal([stringVal("x"), stringVal("five")])]]),
			makeNodeVal("addFiveLambda", [
				["kind", stringVal("lambda")],
				["params", listVal([stringVal("x")])],
				["body", stringVal("addFive")],
				["type", mapVal(new Map([["s:kind", stringVal("fn")]]))],
			]),
		]);
		const result = identifyBoundNodes.fn(nodes);
		assert.ok(result.kind === "set");
		// addFive should be bound (it's a lambda body), addFiveLambda should NOT be bound
		assert.ok(result.value.has(hashValue(stringVal("addFive"))));
		assert.ok(!result.value.has(hashValue(stringVal("addFiveLambda"))));
	});

	it("typecheck:identifyBoundNodes returns empty set when no lambdas", () => {
		const identifyBoundNodes = lookupOperator(registry, "typecheck", "identifyBoundNodes")!;
		const nodes = listVal([
			makeNodeVal("a", [["kind", stringVal("lit")], ["value", intVal(1)]]),
			makeNodeVal("b", [["kind", stringVal("call")], ["ns", stringVal("core")], ["name", stringVal("add")], ["args", listVal([stringVal("a"), stringVal("a")])]]),
		]);
		const result = identifyBoundNodes.fn(nodes);
		assert.ok(result.kind === "set");
		assert.strictEqual(result.value.size, 0);
	});

	// --- Expression type checker ---

	function makeExpr(fields: [string, Value][]): Value {
		return mapVal(new Map(fields.map(([k, val]) => [`s:${k}`, val])));
	}

	function makeSig(params: Value[], returns: Value): Value {
		return mapVal(new Map([
			["s:params", listVal(params)],
			["s:returns", returns],
		]));
	}

	const emptyEnv = mapVal(new Map());
	const emptyNT = mapVal(new Map());

	it("typecheck:typeCheckExpr handles lit expression", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const litExpr = makeExpr([
			["kind", stringVal("lit")],
			["type", makeType("int")],
			["value", intVal(42)],
		]);
		const emptyReg = mapVal(new Map());
		const result = typeCheckExpr.fn(litExpr, emptyEnv, emptyNT, emptyReg);
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("int"));
		const resErrors = result.value.get("s:errors");
		assert.ok(resErrors?.kind === "list");
		assert.strictEqual(resErrors.value.length, 0);
	});

	it("typecheck:typeCheckExpr handles var with env lookup", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const varExpr = makeExpr([
			["kind", stringVal("var")],
			["name", stringVal("x")],
		]);
		const env = mapVal(new Map([["s:x", makeType("bool")]]));
		const result = typeCheckExpr.fn(varExpr, env, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("bool"));
	});

	it("typecheck:typeCheckExpr handles var not in env defaults to int", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const varExpr = makeExpr([
			["kind", stringVal("var")],
			["name", stringVal("y")],
		]);
		const result = typeCheckExpr.fn(varExpr, emptyEnv, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("int"));
	});

	it("typecheck:typeCheckExpr handles ref with nodeTypes lookup", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const refExpr = makeExpr([
			["kind", stringVal("ref")],
			["id", stringVal("ten")],
		]);
		const nodeTypes = mapVal(new Map([["s:ten", makeType("int")]]));
		const result = typeCheckExpr.fn(refExpr, emptyEnv, nodeTypes, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("int"));
	});

	it("typecheck:typeCheckExpr handles call with opRegistry", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const callExpr = makeExpr([
			["kind", stringVal("call")],
			["ns", stringVal("core")],
			["name", stringVal("add")],
			["args", listVal([stringVal("a"), stringVal("b")])],
		]);
		const opReg = mapVal(new Map([
			["s:core:add", makeSig([makeType("int"), makeType("int")], makeType("int"))],
		]));
		const result = typeCheckExpr.fn(callExpr, emptyEnv, emptyNT, opReg);
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("int"));
		const resErrors = result.value.get("s:errors");
		assert.ok(resErrors?.kind === "list");
		assert.strictEqual(resErrors.value.length, 0);
	});

	it("typecheck:typeCheckExpr detects call arity mismatch", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const callExpr = makeExpr([
			["kind", stringVal("call")],
			["ns", stringVal("core")],
			["name", stringVal("add")],
			["args", listVal([stringVal("a")])],  // only 1 arg, needs 2
		]);
		const opReg = mapVal(new Map([
			["s:core:add", makeSig([makeType("int"), makeType("int")], makeType("int"))],
		]));
		const result = typeCheckExpr.fn(callExpr, emptyEnv, emptyNT, opReg);
		assert.ok(result.kind === "map");
		const resErrors = result.value.get("s:errors");
		assert.ok(resErrors?.kind === "list");
		assert.ok(resErrors.value.length > 0, "Should have arity error");
	});

	it("typecheck:typeCheckExpr handles let with nested type checking", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		// let x = lit(42:int) in var(x) — should return int
		const letExpr = makeExpr([
			["kind", stringVal("let")],
			["name", stringVal("x")],
			["value", makeExpr([
				["kind", stringVal("lit")],
				["type", makeType("int")],
				["value", intVal(42)],
			])],
			["body", makeExpr([
				["kind", stringVal("var")],
				["name", stringVal("x")],
			])],
		]);
		const result = typeCheckExpr.fn(letExpr, emptyEnv, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("int"));
	});

	it("typecheck:typeCheckExpr handles lambda with fn type", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const lamExpr = makeExpr([
			["kind", stringVal("lambda")],
			["params", listVal([stringVal("x")])],
			["body", stringVal("addBody")],
			["type", makeFnType([makeType("int")], makeType("int"))],
		]);
		const result = typeCheckExpr.fn(lamExpr, emptyEnv, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("fn"));
		const resErrors = result.value.get("s:errors");
		assert.ok(resErrors?.kind === "list");
		assert.strictEqual(resErrors.value.length, 0);
	});

	it("typecheck:typeCheckExpr handles string ref via nodeTypes", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		// When expr is a string (node ref), look up in nodeTypes
		const nodeTypes = mapVal(new Map([["s:myNode", makeType("bool")]]));
		const result = typeCheckExpr.fn(stringVal("myNode"), emptyEnv, nodeTypes, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("bool"));
	});

	it("typecheck:typeCheckExpr handles record returns map type", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const recExpr = makeExpr([
			["kind", stringVal("record")],
			["fields", listVal([])],
		]);
		const result = typeCheckExpr.fn(recExpr, emptyEnv, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("map"));
	});

	it("typecheck:typeCheckExpr handles predicate returns bool type", () => {
		const typeCheckExpr = lookupOperator(registry, "typecheck", "typeCheckExpr")!;
		const predExpr = makeExpr([
			["kind", stringVal("predicate")],
			["name", stringVal("isInt")],
			["value", stringVal("x")],
		]);
		const result = typeCheckExpr.fn(predExpr, emptyEnv, emptyNT, mapVal(new Map()));
		assert.ok(result.kind === "map");
		const resType = result.value.get("s:type");
		assert.ok(resType?.kind === "map");
		assert.deepStrictEqual(resType.value.get("s:kind"), stringVal("bool"));
	});

	// --- Document type checker ---

	it("typecheck:typecheck validates a simple document", () => {
		const typecheck = lookupOperator(registry, "typecheck", "typecheck")!;
		// Document with two lit nodes and an add call
		const doc = mapVal(new Map([
			["s:nodes", listVal([
				makeNodeVal("ten", [["kind", stringVal("lit")], ["type", makeType("int")], ["value", intVal(10)]]),
				makeNodeVal("twenty", [["kind", stringVal("lit")], ["type", makeType("int")], ["value", intVal(20)]]),
				makeNodeVal("sum", [["kind", stringVal("call")], ["ns", stringVal("core")], ["name", stringVal("add")], ["args", listVal([stringVal("ten"), stringVal("twenty")])]]),
			])],
			["s:result", stringVal("sum")],
		]));
		const result = typecheck.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.deepStrictEqual(valid, boolVal(true));
		const errors = result.value.get("s:errors");
		assert.ok(errors?.kind === "list");
		assert.strictEqual(errors.value.length, 0);
		const nodeTypes = result.value.get("s:nodeTypes");
		assert.ok(nodeTypes?.kind === "map");
		// ten should be typed as int
		const tenType = nodeTypes.value.get("s:ten");
		assert.ok(tenType?.kind === "map");
		assert.deepStrictEqual(tenType.value.get("s:kind"), stringVal("int"));
	});

	it("typecheck:typecheck handles empty document", () => {
		const typecheck = lookupOperator(registry, "typecheck", "typecheck")!;
		const doc = mapVal(new Map([
			["s:nodes", listVal([])],
			["s:result", stringVal("none")],
		]));
		const result = typecheck.fn(doc);
		assert.ok(result.kind === "map");
		const valid = result.value.get("s:valid");
		assert.deepStrictEqual(valid, boolVal(true));
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

	// --- CIR expression kinds ---

	function litStrExpr(value: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("lit")],
			["s:value", stringVal(value)],
		]));
	}

	function letExprVal(name: string, value: string, body: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("let")],
			["s:name", stringVal(name)],
			["s:value", stringVal(value)],
			["s:body", stringVal(body)],
		]));
	}

	function lambdaExpr(params: string[], body: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("lambda")],
			["s:params", listVal(params.map(stringVal))],
			["s:body", stringVal(body)],
		]));
	}

	function callExprVal(fn: string, args: string[]): Value {
		return mapVal(new Map([
			["s:kind", stringVal("callExpr")],
			["s:fn", stringVal(fn)],
			["s:args", listVal(args.map(stringVal))],
		]));
	}

	function fixExprVal(fn: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("fix")],
			["s:fn", stringVal(fn)],
		]));
	}

	function ifExprRef(cond: string, then_: string, else_: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("if")],
			["s:cond", stringVal(cond)],
			["s:then", stringVal(then_)],
			["s:else", stringVal(else_)],
		]));
	}

	function recordExprVal(fields: [string, string][]): Value {
		return mapVal(new Map([
			["s:kind", stringVal("record")],
			["s:fields", listVal(fields.map(([k, v]) => mapVal(new Map([
				["s:key", stringVal(k)],
				["s:value", stringVal(v)],
			]))))],
		]));
	}

	function listOfExprVal(elements: string[]): Value {
		return mapVal(new Map([
			["s:kind", stringVal("listOf")],
			["s:elements", listVal(elements.map(stringVal))],
		]));
	}

	function matchExprVal(value: string, cases: [string, string][], default_: string): Value {
		return mapVal(new Map([
			["s:kind", stringVal("match")],
			["s:value", stringVal(value)],
			["s:cases", listVal(cases.map(([pattern, body]) => mapVal(new Map([
				["s:pattern", stringVal(pattern)],
				["s:body", stringVal(body)],
			]))))],
			["s:default", stringVal(default_)],
		]));
	}

	function doExprVal(exprs: string[]): Value {
		return mapVal(new Map([
			["s:kind", stringVal("do")],
			["s:exprs", listVal(exprs.map(stringVal))],
		]));
	}

	it("meta:eval handles let bindings (let x=5 in let y=10 in x+y = 15)", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("five", litExpr(5)),
			makeNode("ten", litExpr(10)),
			makeNode("addBody", callExpr("core", "add", ["x", "y"])),
			makeNode("letInner", letExprVal("y", "ten", "addBody")),
			makeNode("result", letExprVal("x", "five", "letInner")),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(15));
	});

	it("meta:eval handles lambda + callExpr (addFive(10) = 15)", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("five", litExpr(5)),
			makeNode("addBody", callExpr("core", "add", ["x", "five"])),
			makeNode("addFn", lambdaExpr(["x"], "addBody")),
			makeNode("ten", litExpr(10)),
			makeNode("result", callExprVal("addFn", ["ten"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(15));
	});

	it("meta:eval handles fix (factorial(5) = 120)", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		// factorial: fix(outer -> inner(n) -> if n<=1 then 1 else n * inner(n-1))
		const doc = makeDoc([
			makeNode("zero", litExpr(0)),
			makeNode("one", litExpr(1)),
			makeNode("nMinus1", callExpr("core", "sub", ["n", "one"])),
			makeNode("recCall", callExprVal("rec", ["nMinus1"])),
			makeNode("nTimesRec", callExpr("core", "mul", ["n", "recCall"])),
			makeNode("isBase", callExpr("core", "lte", ["n", "one"])),
			makeNode("factBody", ifExprRef("isBase", "one", "nTimesRec")),
			makeNode("factInner", lambdaExpr(["n"], "factBody")),
			makeNode("factOuter", lambdaExpr(["rec"], "factInner")),
			makeNode("factFn", fixExprVal("factOuter")),
			makeNode("five", litExpr(5)),
			makeNode("result", callExprVal("factFn", ["five"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(120));
	});

	it("meta:eval handles record construction", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("ten", litExpr(10)),
			makeNode("twenty", litExpr(20)),
			makeNode("rec", recordExprVal([["a", "ten"], ["b", "twenty"]])),
			makeNode("key", litStrExpr("a")),
			makeNode("result", callExpr("map", "get", ["rec", "key"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(10));
	});

	it("meta:eval handles listOf construction", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("a", litExpr(1)),
			makeNode("b", litExpr(2)),
			makeNode("c", litExpr(3)),
			makeNode("lst", listOfExprVal(["a", "b", "c"])),
			makeNode("idx", litExpr(1)),
			makeNode("result", callExpr("list", "nth", ["lst", "idx"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(2));
	});

	it("meta:eval handles match expression", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("val", litStrExpr("b")),
			makeNode("one", litExpr(1)),
			makeNode("two", litExpr(2)),
			makeNode("zero", litExpr(0)),
			makeNode("result", matchExprVal("val", [["a", "one"], ["b", "two"]], "zero")),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(2));
	});

	it("meta:eval handles do expression (returns last)", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("a", litExpr(1)),
			makeNode("b", litExpr(2)),
			makeNode("c", litExpr(3)),
			makeNode("result", doExprVal(["a", "b", "c"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(3));
	});

	it("meta:eval handles multi-param lambda ((x,y) -> x+y)(3,7) = 10", () => {
		const metaEval = lookupOperator(registry, "meta", "eval")!;
		const doc = makeDoc([
			makeNode("addBody", callExpr("core", "add", ["x", "y"])),
			makeNode("addFn", lambdaExpr(["x", "y"], "addBody")),
			makeNode("three", litExpr(3)),
			makeNode("seven", litExpr(7)),
			makeNode("result", callExprVal("addFn", ["three", "seven"])),
		], "result");
		assert.deepStrictEqual(metaEval.fn(doc), intVal(10));
	});
});
