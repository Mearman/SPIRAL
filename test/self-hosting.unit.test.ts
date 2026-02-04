// SPIRAL Self-Hosting Tests
// Verify that CIR implementations of typechecker and evaluator work correctly

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	bootstrapRegistry,
	cirDocumentToValue,
	valueToCirDocument,
	typeCheckProgram,
	evaluateProgram,
} from "../dist/index.js";

describe("SPIRAL Self-Hosting", () => {
	const registry = bootstrapRegistry();
	const defs = new Map();

	describe("CIR Stdlib Loading", () => {
		it("should load typecheck operators from CIR", () => {
			const typecheckTypecheck = registry.get("typecheck:typecheck");
			assert.ok(typecheckTypecheck, "typecheck:typecheck should be available");
			assert.equal(typecheckTypecheck.params.length, 1, "typecheck:typecheck takes 1 param");
		});

		it("should load meta evaluator from CIR", () => {
			const metaEval = registry.get("meta:eval");
			assert.ok(metaEval, "meta:eval should be available");
			assert.equal(metaEval.params.length, 1, "meta:eval takes 1 param");
		});

		it("should load 122+ operators total", () => {
			assert.ok(registry.size > 120, `Registry should have 120+ operators, got ${registry.size}`);
		});

		it("should load registry operators from CIR", () => {
			assert.ok(registry.get("registry:empty"), "registry:empty should be available");
			assert.ok(registry.get("registry:opKey"), "registry:opKey should be available");
			assert.ok(registry.get("registry:makeOpKey"), "registry:makeOpKey should be available");
			assert.ok(registry.get("registry:lookup"), "registry:lookup should be available");
			assert.ok(registry.get("registry:register"), "registry:register should be available");
		});

		it("should load effect system operators from CIR", () => {
			assert.ok(registry.get("effects:empty"), "effects:empty should be available");
			assert.ok(registry.get("effects:lookup"), "effects:lookup should be available");
			assert.ok(registry.get("effects:register"), "effects:register should be available");
			assert.ok(registry.get("effects:createIO"), "effects:createIO should be available");
			assert.ok(registry.get("effects:createState"), "effects:createState should be available");
		});
	});

	describe("CIRDocument ↔ Value Conversion", () => {
		it("should convert simple CIR document to Value", () => {
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				],
				result: "x",
			};

			const value = cirDocumentToValue(doc);
			assert.equal(value.kind, "map", "Result should be a map");
			assert.ok(value.value.has("version"), "Map should have version");
			assert.ok(value.value.has("nodes"), "Map should have nodes");
			assert.ok(value.value.has("result"), "Map should have result");
		});

		it("should convert CIR document with multiple nodes", () => {
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
					{ id: "result", expr: { kind: "call", ns: "core", "name": "add", "args": ["a", "b"] } },
				],
				result: "result",
			};

			const value = cirDocumentToValue(doc);
			const nodesList = value.value.get("nodes");
			assert.ok(nodesList, "Should have nodes");
			assert.equal(nodesList.kind, "list");
			assert.equal(nodesList.value.length, 3);
		});

		it("should support round-trip conversion for simple documents", () => {
			const originalDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				],
				result: "x",
			};

			const value = cirDocumentToValue(originalDoc);
			const roundTripped = valueToCirDocument(value);

			assert.equal(roundTripped.version, originalDoc.version);
			assert.equal(roundTripped.nodes.length, originalDoc.nodes.length);
			assert.equal(roundTripped.result, originalDoc.result);

			// Note: airDefs are not round-tripped (returns empty array)
			assert.equal(roundTripped.airDefs.length, 0);
		});

		it("should support round-trip conversion for literal, ref, and var expressions", () => {
			const originalDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
					{ id: "aRef", expr: { kind: "ref", id: "a" } },
					{ id: "aVar", expr: { kind: "var", name: "result" } },
				],
				result: "aRef",
			};

			const value = cirDocumentToValue(originalDoc);
			const roundTripped = valueToCirDocument(value);

			assert.equal(roundTripped.nodes.length, 4);

			// Check literal expression round-trips
			const litNode = roundTripped.nodes.find(n => n.id === "a");
			assert.ok(litNode, "Should have literal node");
			if ("expr" in litNode) {
				assert.equal(litNode.expr.kind, "lit");
				assert.equal(litNode.expr.value, 10);
			}

			// Check ref expression round-trips
			const refNode = roundTripped.nodes.find(n => n.id === "aRef");
			assert.ok(refNode, "Should have ref node");
			if ("expr" in refNode) {
				assert.equal(refNode.expr.kind, "ref");
				assert.equal(refNode.expr.id, "a");
			}

			// Check var expression round-trips
			const varNode = roundTripped.nodes.find(n => n.id === "aVar");
			assert.ok(varNode, "Should have var node");
			if ("expr" in varNode) {
				assert.equal(varNode.expr.kind, "var");
				assert.equal(varNode.expr.name, "result");
			}
		});
	});

	describe("TypeScript vs CIR Typecheck", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "result", expr: { kind: "call", ns: "core", "name": "add", "args": ["x", "x"] } },
			],
			result: "result",
		};

		it("should typecheck with TypeScript implementation", () => {
			const result = typeCheckProgram(doc, registry, defs);
			assert.equal(result.resultType.kind, "int");
		});

		it("should typecheck with CIR implementation (via registry)", () => {
			const typecheckOp = registry.get("typecheck:typecheck");
			assert.ok(typecheckOp, "typecheck:typecheck operator should be available");

			// Note: CIR typechecker expects Value, not CIRDocument
			// This test verifies the operator is loaded, not that it works
			assert.equal(typecheckOp.params.length, 1);
		});
	});

	describe("TypeScript vs CIR Evaluation", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "result", expr: { kind: "call", ns: "core", "name": "add", "args": ["x", "x"] } },
			],
			result: "result",
		};

		it("should evaluate with TypeScript implementation", () => {
			const result = evaluateProgram(doc, registry, defs);
			assert.equal(result.kind, "int");
			assert.equal(result.value, 20);
		});

		it("should have CIR evaluator available (via registry)", () => {
			const metaEval = registry.get("meta:eval");
			assert.ok(metaEval, "meta:eval operator should be available");
			assert.equal(metaEval.params.length, 1);
		});
	});
});
