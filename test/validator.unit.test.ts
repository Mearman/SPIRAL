// SPIRAL Validator Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { validateAIR, validateCIR } from "../src/validator.js";

describe("AIR Validation", () => {
	it("should validate a minimal AIR document", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.errors.length, 0);
	});

	it("should reject document with missing version", () => {
		const doc = {
			airDefs: [],
			nodes: [],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.length > 0);
	});

	it("should reject document with invalid version format", () => {
		const doc = {
			version: "1.0",
			airDefs: [],
			nodes: [],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
	});

	it("should reject document with duplicate node IDs", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{
					id: "n1",
					expr: { kind: "lit", type: { kind: "bool" }, value: true },
				},
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("Duplicate")));
	});

	it("should reject document with invalid result reference", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "n1", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
			],
			result: "nonexistent",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("non-existent")));
	});
});

describe("CIR Validation", () => {
	it("should validate a minimal CIR document with lambda", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "n1",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "n2",
						type: {
							kind: "fn",
							params: [{ kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{ id: "n2", expr: { kind: "var", name: "x" } },
			],
			result: "n1",
		};
		const result = validateCIR(doc);
		assert.strictEqual(result.valid, true);
	});

	it("should reject CIR document with lambda in AIR mode", () => {
		// This test verifies that validateAIR rejects CIR-only expressions
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "n1",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "n2",
						type: {
							kind: "fn",
							params: [{ kind: "int" }],
							returns: { kind: "int" },
						},
					},
				},
				{ id: "n2", expr: { kind: "var", name: "x" } },
			],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
	});
});

describe("Hybrid Node Validation - AIR", () => {
	it("should validate AIR document with block node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					blocks: [
						{
							id: "entry",
							instructions: [
								{
									kind: "assign",
									target: "x",
									value: { kind: "lit", type: { kind: "int" }, value: 42 },
								},
							],
							terminator: { kind: "return", value: "x" },
						},
					],
					entry: "entry",
				},
			],
			result: "result",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, true, "AIR should accept block nodes");
	});

	it("should validate AIR document with mixed expr and block nodes", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "y", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
				{
					id: "max",
					blocks: [
						{
							id: "entry",
							instructions: [
								{ kind: "op", target: "cond", ns: "core", name: "gt", args: ["x", "y"] },
							],
							terminator: { kind: "branch", cond: "cond", then: "retX", else: "retY" },
						},
						{
							id: "retX",
							instructions: [],
							terminator: { kind: "return", value: "x" },
						},
						{
							id: "retY",
							instructions: [],
							terminator: { kind: "return", value: "y" },
						},
					],
					entry: "entry",
				},
			],
			result: "max",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, true, "AIR should accept hybrid documents");
	});

	it("should reject AIR node without expr or blocks", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [{ id: "n1" }],
			result: "n1",
		};
		const result = validateAIR(doc);
		assert.strictEqual(result.valid, false);
		assert.ok(result.errors.some((e) => e.message.includes("blocks") || e.message.includes("expr")));
	});
});

describe("Hybrid Node Validation - CIR", () => {
	it("should validate CIR document with block node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					blocks: [
						{
							id: "entry",
							instructions: [
								{
									kind: "assign",
									target: "x",
									value: { kind: "lit", type: { kind: "int" }, value: 99 },
								},
							],
							terminator: { kind: "return", value: "x" },
						},
					],
					entry: "entry",
				},
			],
			result: "result",
		};
		const result = validateCIR(doc);
		assert.strictEqual(result.valid, true, "CIR should accept block nodes");
	});

	it("should validate CIR document with hybrid expr and block nodes", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "base",
					expr: { kind: "lit", type: { kind: "int" }, value: 5 },
				},
				{
					id: "compute",
					blocks: [
						{
							id: "entry",
							instructions: [
								{ kind: "op", target: "doubled", ns: "core", name: "mul", args: ["base", "base"] },
							],
							terminator: { kind: "return", value: "doubled" },
						},
					],
					entry: "entry",
				},
			],
			result: "compute",
		};
		const result = validateCIR(doc);
		assert.strictEqual(result.valid, true, "CIR should accept hybrid documents");
	});
});
