// SPDX-License-Identifier: MIT
// SPIRAL String Domain - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createStringRegistry } from "../src/domains/string.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	stringVal,
	intVal,
	boolVal,
	listVal,
} from "../src/types.js";
import type { Value } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registry = createStringRegistry();

function op(name: string) {
	const operator = lookupOperator(registry, "string", name);
	if (!operator) throw new Error(`Operator string:${name} not found`);
	return operator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("string domain", () => {
	// =======================================================================
	// concat
	// =======================================================================
	describe("concat", () => {
		it("concatenates two non-empty strings", () => {
			const result = op("concat").fn(stringVal("hello"), stringVal(" world"));
			assert.deepStrictEqual(result, stringVal("hello world"));
		});

		it("concatenates with an empty string", () => {
			const result = op("concat").fn(stringVal("abc"), stringVal(""));
			assert.deepStrictEqual(result, stringVal("abc"));
		});

		it("concatenates two empty strings", () => {
			const result = op("concat").fn(stringVal(""), stringVal(""));
			assert.deepStrictEqual(result, stringVal(""));
		});
	});

	// =======================================================================
	// length
	// =======================================================================
	describe("length", () => {
		it("returns length of a non-empty string", () => {
			const result = op("length").fn(stringVal("hello"));
			assert.deepStrictEqual(result, intVal(5));
		});

		it("returns 0 for empty string", () => {
			const result = op("length").fn(stringVal(""));
			assert.deepStrictEqual(result, intVal(0));
		});

		it("counts unicode characters by code units", () => {
			const result = op("length").fn(stringVal("ab"));
			assert.deepStrictEqual(result, intVal(2));
		});
	});

	// =======================================================================
	// slice
	// =======================================================================
	describe("slice", () => {
		it("extracts a substring by indices", () => {
			const result = op("slice").fn(stringVal("hello world"), intVal(0), intVal(5));
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("extracts middle portion", () => {
			const result = op("slice").fn(stringVal("abcdef"), intVal(2), intVal(4));
			assert.deepStrictEqual(result, stringVal("cd"));
		});

		it("returns empty string when start equals end", () => {
			const result = op("slice").fn(stringVal("abc"), intVal(1), intVal(1));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("handles negative indices", () => {
			const result = op("slice").fn(stringVal("hello"), intVal(-3), intVal(-1));
			assert.deepStrictEqual(result, stringVal("ll"));
		});

		it("returns empty string for out-of-bounds start beyond length", () => {
			const result = op("slice").fn(stringVal("abc"), intVal(10), intVal(20));
			assert.deepStrictEqual(result, stringVal(""));
		});
	});

	// =======================================================================
	// indexOf
	// =======================================================================
	describe("indexOf", () => {
		it("returns index of found substring", () => {
			const result = op("indexOf").fn(stringVal("hello world"), stringVal("world"));
			assert.deepStrictEqual(result, intVal(6));
		});

		it("returns -1 when substring is not found", () => {
			const result = op("indexOf").fn(stringVal("hello"), stringVal("xyz"));
			assert.deepStrictEqual(result, intVal(-1));
		});

		it("returns 0 for empty search string", () => {
			const result = op("indexOf").fn(stringVal("abc"), stringVal(""));
			assert.deepStrictEqual(result, intVal(0));
		});

		it("returns first occurrence when multiple exist", () => {
			const result = op("indexOf").fn(stringVal("abcabc"), stringVal("bc"));
			assert.deepStrictEqual(result, intVal(1));
		});
	});

	// =======================================================================
	// toUpper
	// =======================================================================
	describe("toUpper", () => {
		it("converts lowercase to uppercase", () => {
			const result = op("toUpper").fn(stringVal("hello"));
			assert.deepStrictEqual(result, stringVal("HELLO"));
		});

		it("returns empty string for empty input", () => {
			const result = op("toUpper").fn(stringVal(""));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("preserves already uppercase string", () => {
			const result = op("toUpper").fn(stringVal("ABC"));
			assert.deepStrictEqual(result, stringVal("ABC"));
		});
	});

	// =======================================================================
	// toLower
	// =======================================================================
	describe("toLower", () => {
		it("converts uppercase to lowercase", () => {
			const result = op("toLower").fn(stringVal("HELLO"));
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("returns empty string for empty input", () => {
			const result = op("toLower").fn(stringVal(""));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("handles mixed case", () => {
			const result = op("toLower").fn(stringVal("HeLLo WoRLd"));
			assert.deepStrictEqual(result, stringVal("hello world"));
		});
	});

	// =======================================================================
	// trim
	// =======================================================================
	describe("trim", () => {
		it("trims leading and trailing whitespace", () => {
			const result = op("trim").fn(stringVal("  hello  "));
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("returns empty string for whitespace-only input", () => {
			const result = op("trim").fn(stringVal("   "));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("returns same string when no whitespace to trim", () => {
			const result = op("trim").fn(stringVal("abc"));
			assert.deepStrictEqual(result, stringVal("abc"));
		});

		it("trims tabs and newlines", () => {
			const result = op("trim").fn(stringVal("\t\nhello\n\t"));
			assert.deepStrictEqual(result, stringVal("hello"));
		});
	});

	// =======================================================================
	// split
	// =======================================================================
	describe("split", () => {
		it("splits by delimiter", () => {
			const result = op("split").fn(stringVal("a,b,c"), stringVal(","));
			assert.deepStrictEqual(
				result,
				listVal([stringVal("a"), stringVal("b"), stringVal("c")]),
			);
		});

		it("returns single-element list when delimiter not found", () => {
			const result = op("split").fn(stringVal("hello"), stringVal(","));
			assert.deepStrictEqual(result, listVal([stringVal("hello")]));
		});

		it("splits empty string by non-empty delimiter", () => {
			const result = op("split").fn(stringVal(""), stringVal(","));
			assert.deepStrictEqual(result, listVal([stringVal("")]));
		});

		it("splits by multi-character delimiter", () => {
			const result = op("split").fn(stringVal("a::b::c"), stringVal("::"));
			assert.deepStrictEqual(
				result,
				listVal([stringVal("a"), stringVal("b"), stringVal("c")]),
			);
		});
	});

	// =======================================================================
	// includes
	// =======================================================================
	describe("includes", () => {
		it("returns true when substring is present", () => {
			const result = op("includes").fn(stringVal("hello world"), stringVal("world"));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("returns false when substring is absent", () => {
			const result = op("includes").fn(stringVal("hello"), stringVal("xyz"));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("returns true for empty search string", () => {
			const result = op("includes").fn(stringVal("abc"), stringVal(""));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("returns false when searching in empty string for non-empty", () => {
			const result = op("includes").fn(stringVal(""), stringVal("a"));
			assert.deepStrictEqual(result, boolVal(false));
		});
	});

	// =======================================================================
	// replace
	// =======================================================================
	describe("replace", () => {
		it("replaces first occurrence of substring", () => {
			const result = op("replace").fn(
				stringVal("hello world"),
				stringVal("world"),
				stringVal("there"),
			);
			assert.deepStrictEqual(result, stringVal("hello there"));
		});

		it("replaces only the first occurrence", () => {
			const result = op("replace").fn(
				stringVal("abcabc"),
				stringVal("abc"),
				stringVal("x"),
			);
			assert.deepStrictEqual(result, stringVal("xabc"));
		});

		it("returns original when pattern not found", () => {
			const result = op("replace").fn(
				stringVal("hello"),
				stringVal("xyz"),
				stringVal("abc"),
			);
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("replaces with empty string (deletion)", () => {
			const result = op("replace").fn(
				stringVal("hello world"),
				stringVal(" world"),
				stringVal(""),
			);
			assert.deepStrictEqual(result, stringVal("hello"));
		});
	});

	// =======================================================================
	// charAt
	// =======================================================================
	describe("charAt", () => {
		it("returns character at valid index", () => {
			const result = op("charAt").fn(stringVal("hello"), intVal(0));
			assert.deepStrictEqual(result, stringVal("h"));
		});

		it("returns last character", () => {
			const result = op("charAt").fn(stringVal("hello"), intVal(4));
			assert.deepStrictEqual(result, stringVal("o"));
		});

		it("returns empty string for out-of-bounds index", () => {
			const result = op("charAt").fn(stringVal("abc"), intVal(10));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("returns empty string for negative index", () => {
			const result = op("charAt").fn(stringVal("abc"), intVal(-1));
			assert.deepStrictEqual(result, stringVal(""));
		});
	});

	// =======================================================================
	// join
	// =======================================================================
	describe("join", () => {
		it("joins strings with separator", () => {
			const result = op("join").fn(
				listVal([stringVal("a"), stringVal("b"), stringVal("c")]),
				stringVal(","),
			);
			assert.deepStrictEqual(result, stringVal("a,b,c"));
		});

		it("returns empty string for empty list", () => {
			const result = op("join").fn(listVal([]), stringVal(","));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("returns single element without separator", () => {
			const result = op("join").fn(listVal([stringVal("x")]), stringVal("-"));
			assert.deepStrictEqual(result, stringVal("x"));
		});

		it("returns error for non-string elements", () => {
			const result = op("join").fn(
				listVal([stringVal("a"), intVal(1) as unknown as Value]),
				stringVal(","),
			);
			assert.equal(result.kind, "error");
		});
	});

	// =======================================================================
	// substring
	// =======================================================================
	describe("substring", () => {
		it("extracts a substring by indices", () => {
			const result = op("substring").fn(stringVal("hello world"), intVal(0), intVal(5));
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("extracts middle portion", () => {
			const result = op("substring").fn(stringVal("abcdef"), intVal(2), intVal(5));
			assert.deepStrictEqual(result, stringVal("cde"));
		});

		it("returns empty string when start equals end", () => {
			const result = op("substring").fn(stringVal("abc"), intVal(1), intVal(1));
			assert.deepStrictEqual(result, stringVal(""));
		});

		it("handles out-of-bounds end index gracefully", () => {
			const result = op("substring").fn(stringVal("abc"), intVal(1), intVal(100));
			assert.deepStrictEqual(result, stringVal("bc"));
		});
	});
});
