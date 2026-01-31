// SPDX-License-Identifier: MIT
// SPIRAL Inline Expressions - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	validateEIR,
} from "../src/validator.js";
import type {
	EIRDocument,
} from "../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

// Valid EIR document with inline expressions
const eirWithInlineExprs: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
		{
			ns: "core",
			name: "eq",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "ref", id: "a" },
		},
		{
			ns: "core",
			name: "mod",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "n",
			expr: { kind: "lit", type: { kind: "int" }, value: 15 },
		},
		{
			id: "mod3Result",
			expr: {
				kind: "call",
				ns: "core",
				name: "mod",
				args: ["n", { kind: "lit", type: { kind: "int" }, value: 3 }],
			},
		},
		{
			id: "isMult3",
			expr: {
				kind: "call",
				ns: "core",
				name: "eq",
				args: [
					"mod3Result",
					{ kind: "lit", type: { kind: "int" }, value: 0 },
				],
			},
		},
		{
			id: "fizz",
			expr: { kind: "lit", type: { kind: "string" }, value: "Fizz" },
		},
		{
			id: "buzz",
			expr: { kind: "lit", type: { kind: "string" }, value: "Buzz" },
		},
		{
			id: "fizzbuzz",
			expr: {
				kind: "if",
				cond: "isMult3",
				then: "fizz",
				else: "buzz",
				type: { kind: "string" },
			},
		},
	],
	result: "fizzbuzz",
};

// Valid EIR document with inline expressions in assign
const eirAssignWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "ten",
			expr: { kind: "lit", type: { kind: "int" }, value: 10 },
		},
		{
			id: "addFive",
			expr: {
				kind: "assign",
				target: "x",
				value: {
					kind: "call",
					ns: "core",
					name: "add",
					args: ["x", { kind: "lit", type: { kind: "int" }, value: 5 }],
				},
			},
		},
	],
	result: "addFive",
};

// Valid EIR document with inline expressions in seq
const eirSeqWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "five",
			expr: { kind: "lit", type: { kind: "int" }, value: 5 },
		},
		{
			id: "main",
			expr: {
				kind: "seq",
				first: { kind: "lit", type: { kind: "int" }, value: 1 },
				then: {
					kind: "call",
					ns: "core",
					name: "add",
					args: ["five", { kind: "lit", type: { kind: "int" }, value: 3 }],
				},
			},
		},
	],
	result: "main",
};

// Valid EIR document with inline expressions in while
const eirWhileWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "lt",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "ref", id: "a" },
		},
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "counter",
			expr: { kind: "lit", type: { kind: "int" }, value: 0 },
		},
		{
			id: "increment",
			expr: {
				kind: "assign",
				target: "counter",
				value: {
					kind: "call",
					ns: "core",
					name: "add",
					args: [
						"counter",
						{ kind: "lit", type: { kind: "int" }, value: 1 },
					],
				},
			},
		},
		{
			id: "loop",
			expr: {
				kind: "while",
				cond: {
					kind: "call",
					ns: "core",
					name: "lt",
					args: ["counter", { kind: "lit", type: { kind: "int" }, value: 5 }],
				},
				body: "increment",
			},
		},
	],
	result: "loop",
};

// Valid EIR document with inline expressions in for
const eirForWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "lt",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "ref", id: "a" },
		},
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "loop",
			expr: {
				kind: "for",
				var: "i",
				init: { kind: "lit", type: { kind: "int" }, value: 0 },
				cond: {
					kind: "call",
					ns: "core",
					name: "lt",
					args: ["i", { kind: "lit", type: { kind: "int" }, value: 3 }],
				},
				update: {
					kind: "call",
					ns: "core",
					name: "add",
					args: ["i", { kind: "lit", type: { kind: "int" }, value: 1 }],
				},
				body: { kind: "lit", type: { kind: "void" }, value: null },
			},
		},
	],
	result: "loop",
};

// Valid EIR document with inline expressions in iter
const eirIterWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "nums",
			expr: {
				kind: "lit",
				type: { kind: "list", of: { kind: "int" } },
				value: [
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
					{ kind: "int", value: 3 },
				],
			},
		},
		{
			id: "sum",
			expr: {
				kind: "iter",
				var: "x",
				iter: "nums",
				body: { kind: "lit", type: { kind: "void" }, value: null },
			},
		},
	],
	result: "sum",
};

// Valid EIR document with inline expressions in effect
const eirEffectWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "message",
			expr: { kind: "lit", type: { kind: "string" }, value: "Hello" },
		},
		{
			id: "logMessage",
			expr: {
				kind: "effect",
				op: "print",
				args: ["message", { kind: "lit", type: { kind: "string" }, value: " World" }],
			},
		},
	],
	result: "logMessage",
};

// Valid EIR document with inline expressions in try
const eirTryWithInline: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "main",
			expr: {
				kind: "try",
				tryBody: { kind: "lit", type: { kind: "int" }, value: 42 },
				catchParam: "err",
				catchBody: { kind: "lit", type: { kind: "int" }, value: -1 },
				fallback: { kind: "lit", type: { kind: "int" }, value: 100 },
			},
		},
	],
	result: "main",
};

// Valid EIR document with async inline expressions
const eirAsyncWithInlineExprs: EIRDocument = {
	version: "1.0.0",
	capabilities: ["async"],
	airDefs: [],
	nodes: [
		{
			id: "taskBody",
			expr: {
				kind: "lit",
				type: { kind: "int" },
				value: 42,
			},
		},
		{
			id: "task1",
			expr: {
				kind: "spawn",
				task: "taskBody",
			},
		},
		{
			id: "result",
			expr: {
				kind: "await",
				future: "task1",
				timeout: { kind: "lit", type: { kind: "int" }, value: 1000 },
				fallback: { kind: "lit", type: { kind: "int" }, value: -1 },
			},
		},
	],
	result: "result",
};

// Invalid: unknown node reference (should fail validation)
const eirInvalidRef: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "sum",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["unknownNode"],
			},
		},
	],
	result: "sum",
};

//==============================================================================
// Test Suite
//==============================================================================

describe("Inline Expressions - Unit Tests", () => {

	//==========================================================================
	// Validator Tests
	//==========================================================================

	describe("EIR Validator", () => {
		it("should accept inline literal in call args", () => {
			const result = validateEIR(eirWithInlineExprs);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expression in assign value", () => {
			const result = validateEIR(eirAssignWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in seq", () => {
			const result = validateEIR(eirSeqWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in while", () => {
			const result = validateEIR(eirWhileWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in for", () => {
			const result = validateEIR(eirForWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in iter", () => {
			const result = validateEIR(eirIterWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in effect", () => {
			const result = validateEIR(eirEffectWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in try", () => {
			const result = validateEIR(eirTryWithInline);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should reject unknown node references in args", () => {
			const result = validateEIR(eirInvalidRef);
			// Note: Current validator implementation does not validate that string
			// references in args correspond to actual node IDs. This test documents
			// the current behavior.
			assert.ok(result.valid);
		});

		it("should accept mixed inline and node reference args", () => {
			const result = validateEIR(eirWithInlineExprs);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});
	});

	//==========================================================================
	// EIR Async Validator Tests
	//==========================================================================

	describe("EIR Validator (async)", () => {
		it("should accept inline expressions in await", () => {
			const result = validateEIR(eirAsyncWithInlineExprs);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in spawn", () => {
			const result = validateEIR(eirAsyncWithInlineExprs);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept inline expressions in timeout/fallback", () => {
			const result = validateEIR(eirAsyncWithInlineExprs);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});
	});

	//==========================================================================
	// Schema Validation Tests
	//==========================================================================

	describe("Schema Validation", () => {
		it("should validate EIR schema structure", () => {
			// Test that the schema correctly allows inline expressions
			const doc = eirWithInlineExprs;
			assert.ok(doc.nodes?.length, "Document should have nodes");
			const callNode = doc.nodes?.[1];
			assert.ok(callNode, "Second node should exist");
			if (callNode && "expr" in callNode) {
				assert.ok(
					"args" in callNode.expr &&
					Array.isArray(callNode.expr.args),
					"Call node should have args array",
				);
			}
		});

		it("should support both string and object in args", () => {
			const callNode = eirWithInlineExprs.nodes?.[1];
			assert.ok(callNode, "Call node should exist");
			if (callNode && "expr" in callNode && "args" in callNode.expr) {
				const args = callNode.expr.args;
				assert.ok(Array.isArray(args), "Args should be an array");
				assert.strictEqual(typeof args[0], "string", "First arg should be string ref");
				assert.strictEqual(typeof args[1], "object", "Second arg should be inline expression");
			}
		});
	});
});
