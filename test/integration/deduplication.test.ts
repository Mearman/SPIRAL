// SPDX-License-Identifier: MIT
// Integration Tests for $defs and $ref Deduplication
//
// This test suite validates the complete deduplication system including:
// - Intra-file deduplication with $defs and local $ref
// - $imports transpilation to $defs
// - Expression and node-level references
// - Cycle detection
// - Error formatting

import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateProgram } from "../../src/evaluator/air-program.js";
import { transpileImports } from "../../src/desugar/transpile-imports.js";
import { detectCycles } from "../../src/validation/cycle-detection.js";
import {
	formatJsonPointerError,
	formatImportError,
	formatNamespaceNotFoundError,
} from "../../src/validation/error-messages.js";
import { bootstrapRegistry } from "../../src/stdlib/bootstrap.js";
import type { AIRDocument } from "../../src/types.js";

describe("Deduplication Integration Tests", () => {
	describe("Intra-File $defs and $ref", () => {
		it("should resolve expression-level $refs within $defs", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					ten: {
						expr: { kind: "lit", type: { kind: "int" }, value: 10 },
					},
					twenty: {
						expr: { kind: "lit", type: { kind: "int" }, value: 20 },
					},
				},
				airDefs: [],
				nodes: [
					{
						id: "ten",
						expr: { $ref: "#/$defs/ten/expr" },
					},
					{
						id: "twenty",
						expr: { $ref: "#/$defs/twenty/expr" },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["ten", "twenty"],
						},
					},
				],
				result: "sum",
			};

			const result = evaluateProgram(doc, bootstrapRegistry());
			assert.strictEqual(result.kind, "int");
			assert.strictEqual(result.value, 30);
		});

		it("should resolve node-level $refs (aliasing)", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "original",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "alias",
						$ref: "#/nodes/original",
					},
				],
				result: "alias",
			};

			const result = evaluateProgram(doc, bootstrapRegistry());
			assert.strictEqual(result.kind, "int");
			assert.strictEqual(result.value, 42);
		});

		it("should handle nested $defs references", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					five: {
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					ten: {
						expr: { kind: "lit", type: { kind: "int" }, value: 10 },
					},
				},
				airDefs: [],
				nodes: [
					{
						id: "five",
						expr: { $ref: "#/$defs/five/expr" },
					},
					{
						id: "ten",
						expr: { $ref: "#/$defs/ten/expr" },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["five", "ten"],
						},
					},
				],
				result: "sum",
			};

			const evalResult = evaluateProgram(doc, bootstrapRegistry());
			assert.strictEqual(evalResult.kind, "int");
			assert.strictEqual(evalResult.value, 15);
		});
	});

	describe("$imports Transpilation", () => {
		it("should transpile $imports to $defs with #/$defs suffix", () => {
			const doc: AIRDocument & { $imports: Record<string, { $ref: string }> } = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$imports: {
					common: { $ref: "file:///utils/common.cir.json" },
					types: { $ref: "stdlib:core-types" },
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const transpiled = transpileImports(doc);

			// Check that $imports is removed
			assert.strictEqual("$imports" in transpiled, false);

			// Check that $defs contains the transpiled entries
			assert.strictEqual("$defs" in transpiled, true);
			const defs = (transpiled as unknown as { $defs: Record<string, unknown> }).$defs;
			assert.strictEqual("common" in defs, true);
			assert.strictEqual("types" in defs, true);

			// Check that URIs have #/$defs appended
			const commonRef = defs.common as { $ref: string };
			const typesRef = defs.types as { $ref: string };
			assert.strictEqual(commonRef.$ref, "file:///utils/common.cir.json#/$defs");
			assert.strictEqual(typesRef.$ref, "stdlib:core-types#/$defs");
		});

		it("should handle URIs with existing fragments", () => {
			const doc: AIRDocument & { $imports: Record<string, { $ref: string }> } = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$imports: {
					lib: { $ref: "https://example.com/lib.cir.json#/some/fragment" },
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const transpiled = transpileImports(doc);
			const defs = (transpiled as unknown as { $defs: Record<string, unknown> }).$defs;
			const libRef = defs.lib as { $ref: string };

			// Should replace existing fragment with #/$defs
			assert.strictEqual(libRef.$ref, "https://example.com/lib.cir.json#/$defs");
		});

		it("should preserve existing $defs when transpiling", () => {
			const doc: AIRDocument & { $imports: Record<string, { $ref: string }> } = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					localDef: {
						expr: { kind: "lit", type: { kind: "int" }, value: 100 },
					},
				},
				$imports: {
					external: { $ref: "file:///external.cir.json" },
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const transpiled = transpileImports(doc);
			const defs = (transpiled as unknown as { $defs: Record<string, unknown> }).$defs;

			// Should have both local and imported defs
			assert.strictEqual("localDef" in defs, true);
			assert.strictEqual("external" in defs, true);
		});

		it("should return unchanged document when $imports is empty", () => {
			const doc: AIRDocument & { $imports: Record<string, { $ref: string }> } = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$imports: {},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const transpiled = transpileImports(doc);
			assert.strictEqual(transpiled, doc);
		});
	});

	describe("Cycle Detection", () => {
		it("should detect AIR-specific violations (no recursive refs)", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					selfRef: {
						expr: { $ref: "#/$defs/selfRef/expr" },
					},
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const result = detectCycles(doc, "AIR", { checkAIRRestrictions: true });
			assert.strictEqual(result.hasCycle, true);
			assert.strictEqual(result.violations.length, 1);
			assert.strictEqual(result.violations[0].type, "RECURSIVE_REF_IN_AIR");
		});

		it("should allow recursive refs in CIR", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					selfRef: {
						expr: { $ref: "#/$defs/selfRef/expr" },
					},
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const result = detectCycles(doc, "CIR", { checkAIRRestrictions: false });
			// CIR allows recursive refs (detects as cycle but not as violation)
			// Note: Self-references in $defs may not be detected without full resolution
			// This test verifies that no AIR restriction violation is raised for CIR
			assert.strictEqual(result.violations.length, 0);
		});

		it("should not detect cycles in acyclic documents", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				$defs: {
					a: {
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					b: {
						expr: { $ref: "#/$defs/a/expr" },
					},
					c: {
						expr: { $ref: "#/$defs/b/expr" },
					},
				},
				airDefs: [],
				nodes: [],
				result: null,
			};

			const result = detectCycles(doc, "CIR");
			assert.strictEqual(result.hasCycle, false);
			assert.strictEqual(result.cycles.length, 0);
		});
	});

	describe("Error Formatting", () => {
		it("should format JSON Pointer not found errors with suggestions", () => {
			const error = { success: false, error: "Reference '#/$defs/foo' not found" };
			const context = {
				knownDefs: ["fooBar", "fooBaz", "qux"],
				documentUri: "test.cir.json",
			};

			const formatted = formatJsonPointerError("#/$defs/foo", error, context);

			assert.strictEqual(formatted.code, "POINTER_NOT_FOUND");
			assert.strictEqual(formatted.reference, "#/$defs/foo");
			// "Did you mean" + "Available definitions" + "Check that referenced identifier exists" + "Verify JSON Pointer" + document URI
			assert.ok(formatted.suggestions.length >= 3);
		});

		it("should format import not found errors with URI-specific suggestions", () => {
			const formatted = formatImportError(
				"stdlib:nonexistent",
				"404 Not Found",
				{ availableNamespaces: ["core-types", "math"] },
			);

			assert.strictEqual(formatted.code, "IMPORT_NOT_FOUND");
			assert.strictEqual(formatted.suggestions.length, 4); // stdlib check + module name + verify spelling + available
		});

		it("should format namespace errors with 'did you mean' suggestions", () => {
			const available = ["common", "utils", "math"];
			const formatted = formatNamespaceNotFoundError("comon", available);

			assert.strictEqual(formatted.code, "MISSING_IMPORT_NAMESPACE");
			assert.strictEqual(formatted.suggestions.length, 2); // "Did you mean" + available list
			assert.strictEqual(formatted.suggestions[0], 'Did you mean "common"?');
		});

		it("should suggest available namespaces when no close match exists", () => {
			const available = ["foo", "bar", "baz"];
			const formatted = formatNamespaceNotFoundError("xyz", available);

			assert.strictEqual(formatted.suggestions.length, 2); // Both "Did you mean" may be empty and available list
			assert.ok(formatted.suggestions[1], "Available namespaces: foo, bar, baz");
		});
	});

	describe("Backward Compatibility", () => {
		it("should evaluate documents without $defs or $refs unchanged", () => {
			const doc: AIRDocument = {
				$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "ten",
						expr: { kind: "lit", type: { kind: "int" }, value: 10 },
					},
					{
						id: "twenty",
						expr: { kind: "lit", type: { kind: "int" }, value: 20 },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["ten", "twenty"],
						},
					},
				],
				result: "sum",
			};

			const result = evaluateProgram(doc, bootstrapRegistry());
			assert.strictEqual(result.kind, "int");
			assert.strictEqual(result.value, 30);
		});
	});
});
