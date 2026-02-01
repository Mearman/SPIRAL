// SPDX-License-Identifier: MIT
// SPIRAL Canonicalization (JCS Profile) - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	canonicalize,
	canonicalizeNode,
	documentDigest,
	nodeDigest,
	stripMetadata,
} from "../src/canonicalize.js";

//==============================================================================
// Test Fixtures
//==============================================================================

const airDocument = {
	$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
	version: "1.0.0",
	description: "Add 10 and 20",
	airDefs: [],
	nodes: [
		{ id: "ten", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
		{ id: "twenty", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
		{ id: "sum", expr: { kind: "call", ns: "core", name: "add", args: ["ten", "twenty"] } },
	],
	result: "sum",
	expected_result: 30,
};

const eirDocument = {
	$schema: "https://raw.githubusercontent.com/Mearman/SPIRAL/main/eir.schema.json",
	version: "1.0.0",
	capabilities: ["async"],
	nodes: [
		{
			id: "msg",
			expr: { kind: "lit", type: { kind: "string" }, value: "Hello, World!" },
		},
		{
			id: "greeting",
			expr: { kind: "effect", op: "print", args: ["msg"] },
		},
	],
	result: "greeting",
};

const lirBlockNode = {
	id: "main",
	blocks: [
		{
			id: "entry",
			instructions: [
				{ kind: "assign", target: "x", value: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ kind: "op", target: "sum", ns: "core", name: "add", args: ["x", "y"] },
			],
			terminator: { kind: "return", value: "result" },
		},
	],
	entry: "entry",
};

//==============================================================================
// Test Suite
//==============================================================================

describe("Canonicalization (JCS Profile) - Unit Tests", () => {

	//==========================================================================
	// stripMetadata
	//==========================================================================

	describe("stripMetadata", () => {
		it("should remove description and expected_result", () => {
			const result = stripMetadata(airDocument);
			assert.strictEqual("description" in result, false);
			assert.strictEqual("expected_result" in result, false);
		});

		it("should preserve $schema", () => {
			const result = stripMetadata(airDocument);
			assert.strictEqual(result.$schema, airDocument.$schema);
		});

		it("should preserve all recognized fields", () => {
			const result = stripMetadata(airDocument);
			assert.strictEqual(result.version, "1.0.0");
			assert.ok(Array.isArray(result.airDefs));
			assert.ok(Array.isArray(result.nodes));
			assert.strictEqual(result.result, "sum");
		});

		it("should omit airDefs when absent (EIR without airDefs)", () => {
			const doc = { version: "1.0.0", nodes: [], result: "x" };
			const result = stripMetadata(doc);
			assert.strictEqual("airDefs" in result, false);
		});

		it("should include capabilities when present", () => {
			const result = stripMetadata(eirDocument);
			assert.deepStrictEqual(result.capabilities, ["async"]);
		});

		it("should strip arbitrary unknown fields", () => {
			const doc = { version: "1.0.0", nodes: [], result: "x", note: "hi", foo: "bar" };
			const result = stripMetadata(doc);
			assert.strictEqual("note" in result, false);
			assert.strictEqual("foo" in result, false);
		});
	});

	//==========================================================================
	// Key Sorting (JCS)
	//==========================================================================

	describe("JCS key sorting", () => {
		it("should sort document keys lexicographically", () => {
			const result = canonicalize(airDocument);
			// $schema < airDefs < nodes < result < version
			const keys = [...result.matchAll(/"([^"]+)":/g)].map(m => m[1]);
			// First few top-level keys
			const schemaIdx = keys.indexOf("$schema");
			const airDefsIdx = keys.indexOf("airDefs");
			const nodesIdx = keys.indexOf("nodes");
			const resultIdx = keys.indexOf("result");
			const versionIdx = keys.indexOf("version");
			assert.ok(schemaIdx < airDefsIdx, "$schema before airDefs");
			assert.ok(airDefsIdx < nodesIdx, "airDefs before nodes");
			assert.ok(nodesIdx < resultIdx, "nodes before result");
			assert.ok(resultIdx < versionIdx, "result before version");
		});

		it("should sort expression keys (call: args < kind < name < ns)", () => {
			const callExpr = { kind: "call", ns: "core", name: "add", args: ["a", "b"] };
			const result = canonicalizeNode(callExpr);
			assert.strictEqual(result, '{"args":["a","b"],"kind":"call","name":"add","ns":"core"}');
		});

		it("should sort node keys (expr < id)", () => {
			const node = { id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 1 } };
			const result = canonicalizeNode(node);
			assert.ok(result.indexOf('"expr"') < result.indexOf('"id"'));
		});
	});

	//==========================================================================
	// No Whitespace
	//==========================================================================

	describe("no whitespace", () => {
		it("should contain no whitespace between tokens", () => {
			const result = canonicalize(airDocument);
			// Whitespace can appear inside string values, but not between tokens.
			// Remove all string values, then check for whitespace.
			const stripped = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
			assert.ok(!/\s/.test(stripped), `unexpected whitespace in: ${stripped}`);
		});
	});

	//==========================================================================
	// Metadata Stripping in Canonical Output
	//==========================================================================

	describe("metadata stripping in output", () => {
		it("should not contain description in canonical form", () => {
			const result = canonicalize(airDocument);
			assert.ok(!result.includes('"description"'));
		});

		it("should not contain expected_result in canonical form", () => {
			const result = canonicalize(airDocument);
			assert.ok(!result.includes('"expected_result"'));
		});

		it("should contain $schema in canonical form", () => {
			const result = canonicalize(airDocument);
			assert.ok(result.includes('"$schema"'));
		});
	});

	//==========================================================================
	// Number Serialization
	//==========================================================================

	describe("number serialization", () => {
		it("should serialize integers without decimal", () => {
			const node = { kind: "lit", type: { kind: "int" }, value: 10 };
			const result = canonicalizeNode(node);
			assert.ok(result.includes('"value":10'));
		});

		it("should strip trailing zeros from floats", () => {
			const node = { kind: "lit", type: { kind: "float" }, value: 0.1 };
			const result = canonicalizeNode(node);
			assert.ok(result.includes('"value":0.1'));
		});

		it("should serialize negative zero as 0", () => {
			const node = { kind: "lit", type: { kind: "float" }, value: -0 };
			const result = canonicalizeNode(node);
			assert.ok(result.includes('"value":0'));
			assert.ok(!result.includes('"value":-0'));
		});

		it("should reject NaN", () => {
			const node = { kind: "lit", value: NaN };
			assert.throws(() => canonicalizeNode(node), /non-finite/);
		});

		it("should reject Infinity", () => {
			const node = { kind: "lit", value: Infinity };
			assert.throws(() => canonicalizeNode(node), /non-finite/);
		});

		it("should reject negative Infinity", () => {
			const node = { kind: "lit", value: -Infinity };
			assert.throws(() => canonicalizeNode(node), /non-finite/);
		});
	});

	//==========================================================================
	// Array Ordering
	//==========================================================================

	describe("array ordering", () => {
		it("should preserve node order", () => {
			const result = canonicalize(airDocument);
			const tenIdx = result.indexOf('"ten"');
			const twentyIdx = result.indexOf('"twenty"');
			const sumIdx = result.indexOf('"sum"');
			assert.ok(tenIdx < twentyIdx, "ten before twenty");
			assert.ok(twentyIdx < sumIdx, "twenty before sum");
		});

		it("should preserve instruction order in blocks", () => {
			const result = canonicalizeNode(lirBlockNode);
			const assignIdx = result.indexOf('"assign"');
			const opIdx = result.indexOf('"op"');
			assert.ok(assignIdx < opIdx, "assign before op");
		});
	});

	//==========================================================================
	// Optional Field Handling
	//==========================================================================

	describe("optional field handling", () => {
		it("should omit absent optional fields", () => {
			const node = { id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 1 } };
			const result = canonicalizeNode(node);
			const parsed = JSON.parse(result) as Record<string, unknown>;
			// Node-level "type" should not be present (only expr.type exists)
			assert.strictEqual("type" in parsed, false, "node-level type absent");
		});

		it("should include present optional fields", () => {
			const node = { id: "x", type: { kind: "int" }, expr: { kind: "lit", type: { kind: "int" }, value: 1 } };
			const result = canonicalizeNode(node);
			// There will be two "type" occurrences: one in expr, one at node level
			const matches = result.match(/"type"/g);
			assert.ok(matches && matches.length >= 2, "node type and expr type both present");
		});

		it("should not expand defaults", () => {
			const withoutOptional = canonicalizeNode({ name: "x" });
			const withOptionalFalse = canonicalizeNode({ name: "x", optional: false });
			assert.notStrictEqual(withoutOptional, withOptionalFalse);
		});
	});

	//==========================================================================
	// Content Digest
	//==========================================================================

	describe("document digest", () => {
		it("should produce spiral-sha256: prefixed digest", () => {
			const digest = documentDigest(airDocument);
			assert.ok(digest.startsWith("spiral-sha256:"));
		});

		it("should produce 64-char hex after prefix", () => {
			const digest = documentDigest(airDocument);
			const hex = digest.split(":")[1];
			assert.strictEqual(hex.length, 64);
			assert.ok(/^[0-9a-f]+$/.test(hex));
		});

		it("should be deterministic", () => {
			const d1 = documentDigest(airDocument);
			const d2 = documentDigest(airDocument);
			assert.strictEqual(d1, d2);
		});

		it("should differ for different documents", () => {
			const d1 = documentDigest(airDocument);
			const d2 = documentDigest(eirDocument);
			assert.notStrictEqual(d1, d2);
		});

		it("should support alternative algorithms", () => {
			const digest = documentDigest(airDocument, "sha512");
			assert.ok(digest.startsWith("spiral-sha512:"));
			const hex = digest.split(":")[1];
			assert.strictEqual(hex.length, 128);
		});
	});

	describe("node digest", () => {
		it("should produce spiral-sha256: prefixed digest", () => {
			const digest = nodeDigest(lirBlockNode);
			assert.ok(digest.startsWith("spiral-sha256:"));
		});

		it("should be deterministic", () => {
			const d1 = nodeDigest(lirBlockNode);
			const d2 = nodeDigest(lirBlockNode);
			assert.strictEqual(d1, d2);
		});

		it("should differ for nodes with different ids", () => {
			const d1 = nodeDigest({ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 1 } });
			const d2 = nodeDigest({ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 1 } });
			assert.notStrictEqual(d1, d2);
		});
	});

	//==========================================================================
	// Idempotency (Round-trip Stability)
	//==========================================================================

	describe("idempotency", () => {
		it("canonicalize(parse(canonicalize(doc))) === canonicalize(doc)", () => {
			const first = canonicalize(airDocument);
			const reparsed = JSON.parse(first) as Record<string, unknown>;
			const second = canonicalize(reparsed);
			assert.strictEqual(first, second);
		});

		it("idempotent for EIR document", () => {
			const first = canonicalize(eirDocument);
			const reparsed = JSON.parse(first) as Record<string, unknown>;
			const second = canonicalize(reparsed);
			assert.strictEqual(first, second);
		});
	});

	//==========================================================================
	// Layer Coverage
	//==========================================================================

	describe("layer coverage", () => {
		it("should canonicalize CIR document with lambda", () => {
			const cirDoc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "five", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
					{
						id: "addFive",
						expr: {
							kind: "lambda",
							params: ["x"],
							body: "five",
							type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
						},
					},
				],
				result: "addFive",
			};
			const result = canonicalize(cirDoc);
			assert.ok(result.includes('"lambda"'));
			assert.ok(!result.includes("  ")); // no whitespace
		});

		it("should canonicalize LIR document with blocks", () => {
			const lirDoc = {
				version: "1.0.0",
				nodes: [lirBlockNode],
				result: "main",
			};
			const result = canonicalize(lirDoc);
			assert.ok(result.includes('"blocks"'));
			assert.ok(result.includes('"terminator"'));
		});

		it("should canonicalize EIR document with effects", () => {
			const result = canonicalize(eirDocument);
			assert.ok(result.includes('"effect"'));
			assert.ok(result.includes('"print"'));
		});
	});

	//==========================================================================
	// Version Binding
	//==========================================================================

	describe("version binding", () => {
		it("different versions produce different digests", () => {
			const v1 = { version: "1.0.0", airDefs: [], nodes: [], result: "x" };
			const v2 = { version: "2.0.0", airDefs: [], nodes: [], result: "x" };
			assert.notStrictEqual(documentDigest(v1), documentDigest(v2));
		});
	});

	//==========================================================================
	// $schema Inclusion
	//==========================================================================

	describe("$schema inclusion", () => {
		it("documents with $schema produce different digests than without", () => {
			const with$ = { $schema: "https://example.com/air.schema.json", version: "1.0.0", airDefs: [], nodes: [], result: "x" };
			const without$ = { version: "1.0.0", airDefs: [], nodes: [], result: "x" };
			assert.notStrictEqual(documentDigest(with$), documentDigest(without$));
		});

		it("$schema sorts before other keys", () => {
			const result = canonicalize({
				version: "1.0.0",
				$schema: "https://example.com/air.schema.json",
				airDefs: [],
				nodes: [],
				result: "x",
			});
			assert.ok(result.startsWith('{"$schema"'));
		});
	});

	//==========================================================================
	// Unicode Strings
	//==========================================================================

	describe("unicode strings", () => {
		it("should preserve unicode in string values", () => {
			const node = { kind: "lit", type: { kind: "string" }, value: "€ünïcödé" };
			const result = canonicalizeNode(node);
			assert.ok(result.includes("€ünïcödé"));
		});

		it("should escape control characters", () => {
			const node = { kind: "lit", type: { kind: "string" }, value: "line1\nline2\ttab" };
			const result = canonicalizeNode(node);
			assert.ok(result.includes("\\n"));
			assert.ok(result.includes("\\t"));
		});
	});
});
