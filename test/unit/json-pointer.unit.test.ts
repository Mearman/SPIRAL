// JSON Pointer Utilities Unit Tests
// RFC 6901 compliance tests

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	escapeToken,
	unescapeToken,
	parseJsonPointer,
	isValidJsonPointer,
	navigate,
	navigateWithParent,
	buildPointer,
	joinPointers,
	getParentPointer,
} from "../../src/utils/json-pointer.js";

describe("JSON Pointer - Token Escaping", () => {
	describe("escapeToken", () => {
		it("should escape ~ to ~0", () => {
			assert.strictEqual(escapeToken("~"), "~0");
		});

		it("should escape / to ~1", () => {
			assert.strictEqual(escapeToken("/"), "~1");
		});

		it("should escape multiple occurrences", () => {
			assert.strictEqual(escapeToken("a/b~c"), "a~1b~0c");
		});

		it("should leave normal characters unchanged", () => {
			assert.strictEqual(escapeToken("abc123"), "abc123");
		});

		it("should handle empty string", () => {
			assert.strictEqual(escapeToken(""), "");
		});
	});

	describe("unescapeToken", () => {
		it("should unescape ~0 to ~", () => {
			assert.strictEqual(unescapeToken("~0"), "~");
		});

		it("should unescape ~1 to /", () => {
			assert.strictEqual(unescapeToken("~1"), "/");
		});

		it("should unescape multiple occurrences", () => {
			assert.strictEqual(unescapeToken("a~1b~0c"), "a/b~c");
		});

		it("should handle already unescaped tokens", () => {
			assert.strictEqual(unescapeToken("abc123"), "abc123");
		});

		it("should handle empty string", () => {
			assert.strictEqual(unescapeToken(""), "");
		});
	});
});

describe("JSON Pointer - Parsing", () => {
	describe("parseJsonPointer", () => {
		it("should parse root pointer #", () => {
			const result = parseJsonPointer("#");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, []);
		});

		it("should parse root pointer with empty string", () => {
			const result = parseJsonPointer("");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, []);
		});

		it("should parse simple pointer #/foo", () => {
			const result = parseJsonPointer("#/foo");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, ["foo"]);
		});

		it("should parse nested pointer #/foo/bar", () => {
			const result = parseJsonPointer("#/foo/bar");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, ["foo", "bar"]);
		});

		it("should unescape ~0 to ~", () => {
			const result = parseJsonPointer("#/foo~0bar");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, ["foo~bar"]);
		});

		it("should unescape ~1 to /", () => {
			const result = parseJsonPointer("#/foo~1bar");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, ["foo/bar"]);
		});

		it("should handle pointer without # prefix", () => {
			const result = parseJsonPointer("/foo/bar");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.tokens, ["foo", "bar"]);
		});

		it("should reject pointer without leading / (has content)", () => {
			const result = parseJsonPointer("foo/bar");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("must start with"));
		});

		it("should preserve original pointer in result", () => {
			const result = parseJsonPointer("#/foo/bar");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value?.original, "#/foo/bar");
		});
	});

	describe("isValidJsonPointer", () => {
		it("should return true for valid pointers", () => {
			assert.strictEqual(isValidJsonPointer("#"), true);
			assert.strictEqual(isValidJsonPointer("#/foo"), true);
			assert.strictEqual(isValidJsonPointer("#/foo/bar"), true);
			assert.strictEqual(isValidJsonPointer("/foo"), true);
		});

		it("should return false for invalid pointers", () => {
			assert.strictEqual(isValidJsonPointer("foo"), false);
			assert.strictEqual(isValidJsonPointer("#foo"), false);
		});
	});
});

describe("JSON Pointer - Navigation", () => {
	const testObj = {
		foo: 42,
		bar: { baz: "hello" },
		"special/key": "value1",
		"special~key": "value2",
		arr: [1, 2, 3],
	};

	describe("navigate", () => {
		it("should navigate to root with #", () => {
			const result = navigate(testObj, "#");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value, testObj);
		});

		it("should navigate to root with empty string", () => {
			const result = navigate(testObj, "");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value, testObj);
		});

		it("should navigate to simple property", () => {
			const result = navigate(testObj, "#/foo");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, 42);
		});

		it("should navigate to nested property", () => {
			const result = navigate(testObj, "#/bar/baz");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, "hello");
		});

		it("should navigate to array element", () => {
			const result = navigate(testObj, "#/arr/1");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, 2);
		});

		it("should navigate to array element with index 0", () => {
			const result = navigate(testObj, "#/arr/0");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, 1);
		});

		it("should navigate property with / (escaped as ~1)", () => {
			const result = navigate(testObj, "#/special~1key");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, "value1");
		});

		it("should navigate property with ~ (escaped as ~0)", () => {
			const result = navigate(testObj, "#/special~0key");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.value, "value2");
		});

		it("should return error for missing property", () => {
			const result = navigate(testObj, "#/missing");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("not found"));
		});

		it("should return error for invalid pointer syntax", () => {
			const result = navigate(testObj, "invalid");
			assert.strictEqual(result.success, false);
		});

		it("should return error for array index out of bounds", () => {
			const result = navigate(testObj, "#/arr/10");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("out of bounds"));
		});

		it("should return error for array index not a number", () => {
			const result = navigate(testObj, "#/arr/foo");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("Invalid array index"));
		});

		it("should return error for navigating into primitive", () => {
			const result = navigate(testObj, "#/foo/bar");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("Cannot navigate"));
		});
	});

	describe("navigateWithParent", () => {
		it("should navigate and return parent and key", () => {
			const result = navigateWithParent(testObj, "#/bar/baz");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.parent, { baz: "hello" });
			assert.strictEqual(result.value?.key, "baz");
			assert.strictEqual(result.value?.value, "hello");
		});

		it("should navigate array element with parent", () => {
			const result = navigateWithParent(testObj, "#/arr/1");
			assert.strictEqual(result.success, true);
			assert.deepStrictEqual(result.value?.parent, [1, 2, 3]);
			assert.strictEqual(result.value?.key, "1");
			assert.strictEqual(result.value?.value, 2);
		});

		it("should return error for root pointer (no parent)", () => {
			const result = navigateWithParent(testObj, "#");
			assert.strictEqual(result.success, false);
			assert.ok(result.error?.includes("Cannot get parent"));
		});

		it("should return error for missing property", () => {
			const result = navigateWithParent(testObj, "#/missing");
			assert.strictEqual(result.success, false);
		});
	});
});

describe("JSON Pointer - Utility Functions", () => {
	describe("buildPointer", () => {
		it("should build root pointer from empty array", () => {
			assert.strictEqual(buildPointer([]), "#");
		});

		it("should build simple pointer", () => {
			assert.strictEqual(buildPointer(["foo"]), "#/foo");
		});

		it("should build nested pointer", () => {
			assert.strictEqual(buildPointer(["foo", "bar", "baz"]), "#/foo/bar/baz");
		});

		it("should escape special characters", () => {
			assert.strictEqual(buildPointer(["foo/bar", "baz~qux"]), "#/foo~1bar/baz~0qux");
		});

		it("should build without # prefix when requested", () => {
			assert.strictEqual(buildPointer(["foo"], false), "/foo");
		});
	});

	describe("joinPointers", () => {
		it("should join two pointers", () => {
			assert.strictEqual(joinPointers("#/foo", "/bar"), "#/foo/bar");
		});

		it("should handle relative pointer with /", () => {
			assert.strictEqual(joinPointers("#/foo", "/bar"), "#/foo/bar");
		});

		it("should handle joining to root", () => {
			assert.strictEqual(joinPointers("#", "/foo"), "#/foo");
		});

		it("should handle joining root to relative", () => {
			assert.strictEqual(joinPointers("#/foo", ""), "#/foo");
		});

		it("should return base if relative is invalid", () => {
			assert.strictEqual(joinPointers("#/foo", "invalid"), "#/foo");
		});

		it("should return base if base is invalid", () => {
			assert.strictEqual(joinPointers("invalid", "/foo"), "invalid");
		});
	});

	describe("getParentPointer", () => {
		it("should get parent of nested pointer", () => {
			assert.strictEqual(getParentPointer("#/foo/bar"), "#/foo");
		});

		it("should get parent of single-level pointer", () => {
			assert.strictEqual(getParentPointer("#/foo"), "#");
		});

		it("should return root for root pointer", () => {
			assert.strictEqual(getParentPointer("#"), "#");
		});

		it("should handle deeply nested pointer", () => {
			assert.strictEqual(getParentPointer("#/a/b/c"), "#/a/b");
		});

		it("should return original if invalid", () => {
			assert.strictEqual(getParentPointer("invalid"), "invalid");
		});
	});
});

describe("JSON Pointer - Edge Cases", () => {
	it("should handle pointer with only /", () => {
		const result = parseJsonPointer("#/");
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.value?.tokens, [""]);
	});

	it("should handle pointer with multiple consecutive slashes", () => {
		const result = parseJsonPointer("#/foo//bar");
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.value?.tokens, ["foo", "", "bar"]);
	});

	it("should handle pointer with trailing slash", () => {
		const result = parseJsonPointer("#/foo/");
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.value?.tokens, ["foo", ""]);
	});

	it("should navigate object with empty string key", () => {
		const obj = { "": "empty key value" };
		const result = navigate(obj, "#/");
		assert.strictEqual(result.success, true);
		assert.strictEqual(result.value, "empty key value");
	});

	it("should handle very long pointers", () => {
		const tokens = Array(100).fill("foo");
		const pointer = buildPointer(tokens);
		const result = parseJsonPointer(pointer);
		assert.strictEqual(result.success, true);
		assert.strictEqual(result.value?.tokens.length, 100);
	});
});
