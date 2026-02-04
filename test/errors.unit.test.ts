import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	SPIRALError,
	ErrorCodes,
	validResult,
	invalidResult,
	combineResults,
	exhaustive,
} from "../src/errors.ts";
import type { Type, Value } from "../src/types.ts";

describe("SPIRALError class", () => {
	it("constructor sets code, message, name, and meta is undefined", () => {
		const err = new SPIRALError(ErrorCodes.TypeError, "test msg");
		assert.equal(err.code, "TypeError");
		assert.equal(err.message, "test msg");
		assert.equal(err.name, "SPIRALError");
		assert.equal(err.meta, undefined);
	});

	it("constructor with meta stores the meta map", () => {
		const meta = new Map<string, Value>([
			["key", { kind: "int", value: 42 }],
		]);
		const err = new SPIRALError(ErrorCodes.TypeError, "test", meta);
		assert.notEqual(err.meta, undefined);
		assert.equal(err.meta!.get("key")?.kind, "int");
	});

	it("toValue() without meta returns value with no meta property", () => {
		const err = new SPIRALError(ErrorCodes.TypeError, "test msg");
		const val = err.toValue();
		assert.deepEqual(val, { kind: "error", code: "TypeError" });
		assert.equal("meta" in val, false);
	});

	it("toValue() with meta includes meta property", () => {
		const meta = new Map<string, Value>([
			["key", { kind: "int", value: 42 }],
		]);
		const err = new SPIRALError(ErrorCodes.TypeError, "test", meta);
		const val = err.toValue();
		assert.equal(val.kind, "error");
		assert.equal(val.code, "TypeError");
		assert.notEqual(val.meta, undefined);
	});
});

describe("Static factories", () => {
	it("typeError without context", () => {
		const err = SPIRALError.typeError({ kind: "int" }, { kind: "bool" });
		assert.equal(err.code, "TypeError");
		assert.match(err.message, /Type error/);
		assert.match(err.message, /int/);
		assert.match(err.message, /bool/);
	});

	it("typeError with context", () => {
		const err = SPIRALError.typeError(
			{ kind: "int" },
			{ kind: "bool" },
			"addition operand",
		);
		assert.match(err.message, /addition operand/);
	});

	it("arityError", () => {
		const err = SPIRALError.arityError(2, 3, "myFunc");
		assert.equal(err.code, "ArityError");
		assert.match(err.message, /myFunc/);
		assert.match(err.message, /2/);
		assert.match(err.message, /3/);
	});

	it("domainError", () => {
		const err = SPIRALError.domainError("bad domain");
		assert.equal(err.code, "DomainError");
		assert.match(err.message, /bad domain/);
	});

	it("divideByZero", () => {
		const err = SPIRALError.divideByZero();
		assert.equal(err.code, "DivideByZero");
		assert.match(err.message, /Division by zero/);
	});

	it("unknownOperator", () => {
		const err = SPIRALError.unknownOperator("math", "sqrt");
		assert.equal(err.code, "UnknownOperator");
		assert.match(err.message, /math:sqrt/);
	});

	it("unknownDefinition", () => {
		const err = SPIRALError.unknownDefinition("core", "foo");
		assert.equal(err.code, "UnknownDefinition");
		assert.match(err.message, /core:foo/);
	});

	it("unboundIdentifier", () => {
		const err = SPIRALError.unboundIdentifier("x");
		assert.equal(err.code, "UnboundIdentifier");
		assert.match(err.message, /x/);
	});

	it("nonTermination", () => {
		const err = SPIRALError.nonTermination();
		assert.equal(err.code, "NonTermination");
	});

	it("validation without value", () => {
		const err = SPIRALError.validation("root.nodes[0]", "missing id");
		assert.equal(err.code, "ValidationError");
		assert.match(err.message, /root\.nodes\[0\]/);
		assert.match(err.message, /missing id/);
		assert.ok(!err.message.includes("(value:"));
	});

	it("validation with value", () => {
		const err = SPIRALError.validation("root", "bad", 42);
		assert.equal(err.code, "ValidationError");
		assert.match(err.message, /\(value: 42\)/);
	});
});

describe("formatType (via typeError messages)", () => {
	function typeMsg(t: Type): string {
		return SPIRALError.typeError(t, { kind: "bool" }).message;
	}

	it("formats bool", () => {
		assert.match(typeMsg({ kind: "bool" }), /expected bool/);
	});

	it("formats int", () => {
		assert.match(typeMsg({ kind: "int" }), /expected int/);
	});

	it("formats float", () => {
		assert.match(typeMsg({ kind: "float" }), /expected float/);
	});

	it("formats string", () => {
		assert.match(typeMsg({ kind: "string" }), /expected string/);
	});

	it("formats void", () => {
		assert.match(typeMsg({ kind: "void" }), /expected void/);
	});

	it("formats set<int>", () => {
		assert.match(
			typeMsg({ kind: "set", of: { kind: "int" } }),
			/expected set<int>/,
		);
	});

	it("formats list<string>", () => {
		assert.match(
			typeMsg({ kind: "list", of: { kind: "string" } }),
			/expected list<string>/,
		);
	});

	it("formats map<string, int>", () => {
		assert.match(
			typeMsg({
				kind: "map",
				key: { kind: "string" },
				value: { kind: "int" },
			}),
			/expected map<string, int>/,
		);
	});

	it("formats option<bool>", () => {
		assert.match(
			typeMsg({ kind: "option", of: { kind: "bool" } }),
			/expected option<bool>/,
		);
	});

	it("formats ref<int>", () => {
		assert.match(
			typeMsg({ kind: "ref", of: { kind: "int" } }),
			/expected ref<int>/,
		);
	});

	it("formats opaque(MyType)", () => {
		assert.match(
			typeMsg({ kind: "opaque", name: "MyType" }),
			/expected opaque\(MyType\)/,
		);
	});

	it("formats fn(int) -> bool", () => {
		assert.match(
			typeMsg({
				kind: "fn",
				params: [{ kind: "int" }],
				returns: { kind: "bool" },
			}),
			/expected fn\(int\) -> bool/,
		);
	});

	it("formats unknown for unrecognized type kind", () => {
		assert.match(
			typeMsg({ kind: "weird" } as unknown as Type),
			/expected unknown/,
		);
	});
});

describe("validResult / invalidResult / combineResults", () => {
	it("validResult creates a valid result", () => {
		const r = validResult(42);
		assert.deepEqual(r, { valid: true, errors: [], value: 42 });
	});

	it("invalidResult creates an invalid result", () => {
		const r = invalidResult([{ path: "x", message: "bad" }]);
		assert.deepEqual(r, {
			valid: false,
			errors: [{ path: "x", message: "bad" }],
		});
	});

	it("combineResults with all valid returns valid with values array", () => {
		const r = combineResults([validResult(1), validResult(2), validResult(3)]);
		assert.equal(r.valid, true);
		assert.deepEqual(r.value, [1, 2, 3]);
		assert.deepEqual(r.errors, []);
	});

	it("combineResults with some invalid returns invalid with all errors", () => {
		const r = combineResults([
			validResult(1),
			invalidResult([{ path: "a", message: "err1" }]),
			invalidResult([{ path: "b", message: "err2" }]),
		]);
		assert.equal(r.valid, false);
		assert.equal(r.errors.length, 2);
		assert.equal(r.errors[0].path, "a");
		assert.equal(r.errors[1].path, "b");
	});

	it("combineResults with empty array returns valid with empty values", () => {
		const r = combineResults([]);
		assert.equal(r.valid, true);
		assert.deepEqual(r.value, []);
		assert.deepEqual(r.errors, []);
	});

	it("combineResults excludes undefined values from valid results", () => {
		const withUndefined = { valid: true as const, errors: [] };
		const r = combineResults([validResult(1), withUndefined, validResult(3)]);
		assert.equal(r.valid, true);
		assert.deepEqual(r.value, [1, 3]);
	});
});

describe("exhaustive", () => {
	it("throws for unexpected value", () => {
		assert.throws(
			() => exhaustive("unexpected" as never),
			/Unexpected value/,
		);
	});
});
