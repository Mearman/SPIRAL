import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateLIR } from "../src/lir/evaluator.js";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import {
	createDefaultEffectRegistry,
} from "../src/effects.js";
import { emptyValueEnv, extendValueEnv } from "../src/env.js";
import {
	intVal,
	boolVal,
	stringVal,
	floatVal,
	errorVal,
	voidVal,
} from "../src/types.js";
import type { LIRDocument, LirBlock } from "../src/types.js";

// =============================================================================
// Helpers
// =============================================================================

function makeLIRDoc(
	blocks: LirBlock[],
	entry: string,
	resultId: string = "main",
): LIRDocument {
	return {
		version: "1.0.0",
		nodes: [{ id: resultId, blocks, entry }],
		result: resultId,
	};
}

function makeExprDoc(id: string, expr: any): LIRDocument {
	return {
		version: "1.0.0",
		nodes: [{ id, expr }],
		result: id,
	};
}

const registry = createKernelRegistry();
const effectRegistry = createDefaultEffectRegistry();

// =============================================================================
// 1. Basic
// =============================================================================

describe("LIR Evaluator", () => {
	describe("basic", () => {
		it("expression-only result node returns evaluated value", () => {
			const doc = makeExprDoc("r", {
				kind: "lit",
				type: { kind: "int" },
				value: 42,
			});
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(42));
		});

		it("missing result node returns ValidationError", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "existing",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "nonexistent",
			};
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "ValidationError");
			}
		});

		it("missing entry block returns ValidationError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "b0",
						instructions: [],
						terminator: { kind: "return" },
					},
				],
				"nonexistent",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "ValidationError");
			}
		});
	});

	// ===========================================================================
	// 2. CFG execution
	// ===========================================================================

	describe("CFG execution", () => {
		it("single block with assign and return", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 5,
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(5));
		});

		it("jump between blocks", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "a",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 10,
								},
							},
						],
						terminator: { kind: "jump", to: "b" },
					},
					{
						id: "b",
						instructions: [],
						terminator: { kind: "return", value: "x" },
					},
				],
				"a",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(10));
		});

		it("branch true path", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "cond",
								value: {
									kind: "lit",
									type: { kind: "bool" },
									value: true,
								},
							},
						],
						terminator: {
							kind: "branch",
							cond: "cond",
							then: "yes",
							else: "no",
						},
					},
					{
						id: "yes",
						instructions: [
							{
								kind: "assign",
								target: "r",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 1,
								},
							},
						],
						terminator: { kind: "return", value: "r" },
					},
					{
						id: "no",
						instructions: [
							{
								kind: "assign",
								target: "r",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 0,
								},
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(1));
		});

		it("branch false path", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "cond",
								value: {
									kind: "lit",
									type: { kind: "bool" },
									value: false,
								},
							},
						],
						terminator: {
							kind: "branch",
							cond: "cond",
							then: "yes",
							else: "no",
						},
					},
					{
						id: "yes",
						instructions: [
							{
								kind: "assign",
								target: "r",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 1,
								},
							},
						],
						terminator: { kind: "return", value: "r" },
					},
					{
						id: "no",
						instructions: [
							{
								kind: "assign",
								target: "r",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 0,
								},
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(0));
		});

		it("branch on non-bool returns TypeError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 42,
								},
							},
						],
						terminator: {
							kind: "branch",
							cond: "x",
							then: "a",
							else: "b",
						},
					},
					{
						id: "a",
						instructions: [],
						terminator: { kind: "return" },
					},
					{
						id: "b",
						instructions: [],
						terminator: { kind: "return" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TypeError");
			}
		});

		it("branch on unbound variable returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [],
						terminator: {
							kind: "branch",
							cond: "nonexistent",
							then: "a",
							else: "b",
						},
					},
					{
						id: "a",
						instructions: [],
						terminator: { kind: "return" },
					},
					{
						id: "b",
						instructions: [],
						terminator: { kind: "return" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});

		it("exit terminator without code returns void", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [],
						terminator: { kind: "exit" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, voidVal());
		});

		it("exit terminator with code returns the value", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 0,
								},
							},
						],
						terminator: { kind: "exit", code: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(0));
		});

		it("missing block during execution returns ValidationError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [],
						terminator: { kind: "jump", to: "nonexistent" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "ValidationError");
			}
		});
	});

	// ===========================================================================
	// 3. assign instruction
	// ===========================================================================

	describe("assign instruction", () => {
		it("literal int", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 42,
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(42));
		});

		it("literal bool", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "bool" },
									value: true,
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("literal float", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "float" },
									value: 3.14,
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, floatVal(3.14));
		});

		it("literal string", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "string" },
									value: "hello",
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, stringVal("hello"));
		});

		it("literal void", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "void" },
									value: null,
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, voidVal());
		});

		it("complex literal type returns TypeError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "list", of: { kind: "int" } },
									value: [],
								},
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TypeError");
			}
		});

		it("variable reference from inputs env", () => {
			const inputs = extendValueEnv(emptyValueEnv(), "x", intVal(99));
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "y",
								value: { kind: "var", name: "x" },
							},
						],
						terminator: { kind: "return", value: "y" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.deepStrictEqual(result, intVal(99));
		});

		it("unbound variable returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assign",
								target: "y",
								value: { kind: "var", name: "missing" },
							},
						],
						terminator: { kind: "return", value: "y" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});
	});

	// ===========================================================================
	// 4. op instruction
	// ===========================================================================

	describe("op instruction", () => {
		it("registered operator core:add", () => {
			const inputs = extendValueEnv(
				extendValueEnv(emptyValueEnv(), "a", intVal(2)),
				"b",
				intVal(3),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "op",
								target: "r",
								ns: "core",
								name: "add",
								args: ["a", "b"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.deepStrictEqual(result, intVal(5));
		});

		it("unknown operator returns UnknownOperator", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "op",
								target: "r",
								ns: "fake",
								name: "nope",
								args: [],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnknownOperator");
			}
		});

		it("arity mismatch returns ArityError", () => {
			const inputs = extendValueEnv(emptyValueEnv(), "a", intVal(1));
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "op",
								target: "r",
								ns: "core",
								name: "add",
								args: ["a"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "ArityError");
			}
		});

		it("unbound arg returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "op",
								target: "r",
								ns: "core",
								name: "add",
								args: ["missing", "also_missing"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});

		it("error-valued arg propagates the error", () => {
			const inputs = extendValueEnv(
				extendValueEnv(
					emptyValueEnv(),
					"a",
					errorVal("TestErr", "test error"),
				),
				"b",
				intVal(1),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "op",
								target: "r",
								ns: "core",
								name: "add",
								args: ["a", "b"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TestErr");
			}
		});
	});

	// ===========================================================================
	// 5. phi instruction
	// ===========================================================================

	describe("phi instruction", () => {
		it("predecessor match selects correct source", () => {
			// Block a assigns x=10, jumps to c
			// Block b assigns y=20, jumps to c
			// Block c has phi: z = phi(x from a, y from b), returns z
			// Entry is a, so predecessor of c is a => z = x = 10
			const doc = makeLIRDoc(
				[
					{
						id: "a",
						instructions: [
							{
								kind: "assign",
								target: "x",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 10,
								},
							},
						],
						terminator: { kind: "jump", to: "c" },
					},
					{
						id: "b",
						instructions: [
							{
								kind: "assign",
								target: "y",
								value: {
									kind: "lit",
									type: { kind: "int" },
									value: 20,
								},
							},
						],
						terminator: { kind: "jump", to: "c" },
					},
					{
						id: "c",
						instructions: [
							{
								kind: "phi",
								target: "z",
								sources: [
									{ id: "x", block: "a" },
									{ id: "y", block: "b" },
								],
							},
						],
						terminator: { kind: "return", value: "z" },
					},
				],
				"a",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, intVal(10));
		});

		it("fallback to first valid source when no predecessor match", () => {
			// Entry block with phi but no predecessor set (first block)
			// phi should fallback to first source whose var is bound
			const inputs = extendValueEnv(emptyValueEnv(), "v", intVal(77));
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "phi",
								target: "z",
								sources: [
									{ id: "v", block: "nonexistent" },
									{ id: "w", block: "also_nonexistent" },
								],
							},
						],
						terminator: { kind: "return", value: "z" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.deepStrictEqual(result, intVal(77));
		});

		it("no valid sources returns DomainError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "phi",
								target: "z",
								sources: [
									{ id: "missing1", block: "x" },
									{ id: "missing2", block: "y" },
								],
							},
						],
						terminator: { kind: "return", value: "z" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "DomainError");
			}
		});
	});

	// ===========================================================================
	// 6. effect instruction
	// ===========================================================================

	describe("effect instruction", () => {
		it("registered effect 'print' records effect and returns void", () => {
			const inputs = extendValueEnv(
				emptyValueEnv(),
				"msg",
				stringVal("hi"),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "effect",
								target: "r",
								op: "print",
								args: ["msg"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result, state } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.deepStrictEqual(result, voidVal());
			assert.equal(state.effects.length, 1);
			assert.equal(state.effects[0].op, "print");
			assert.deepStrictEqual(state.effects[0].args, [stringVal("hi")]);
		});

		it("unknown effect returns UnknownOperator", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "effect",
								target: "r",
								op: "nonexistent",
								args: [],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnknownOperator");
			}
		});

		it("arity mismatch returns ArityError", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "effect",
								target: "r",
								op: "print",
								args: [],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "ArityError");
			}
		});

		it("unbound arg returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "effect",
								target: "r",
								op: "print",
								args: ["missing"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});

		it("error-valued arg propagates the error", () => {
			const inputs = extendValueEnv(
				emptyValueEnv(),
				"msg",
				errorVal("TestErr", "test error"),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "effect",
								target: "r",
								op: "print",
								args: ["msg"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TestErr");
			}
		});
	});

	// ===========================================================================
	// 7. call instruction
	// ===========================================================================

	describe("call instruction", () => {
		it("returns DomainError (not yet implemented)", () => {
			const inputs = extendValueEnv(
				extendValueEnv(emptyValueEnv(), "fn", intVal(0)),
				"arg1",
				intVal(1),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "call",
								target: "r",
								callee: "fn",
								args: ["arg1"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			// call stores a DomainError in the target var, then returns it
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "DomainError");
			}
		});

		it("unbound arg returns UnboundIdentifier", () => {
			const inputs = extendValueEnv(
				emptyValueEnv(),
				"fn",
				intVal(0),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "call",
								target: "r",
								callee: "fn",
								args: ["missing"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});

		it("error-valued arg propagates the error", () => {
			const inputs = extendValueEnv(
				extendValueEnv(
					emptyValueEnv(),
					"fn",
					intVal(0),
				),
				"arg1",
				errorVal("TestErr", "test error"),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "call",
								target: "r",
								callee: "fn",
								args: ["arg1"],
							},
						],
						terminator: { kind: "return", value: "r" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TestErr");
			}
		});
	});

	// ===========================================================================
	// 8. assignRef instruction
	// ===========================================================================

	describe("assignRef instruction", () => {
		it("assigns value to ref cell", () => {
			const inputs = extendValueEnv(emptyValueEnv(), "x", intVal(42));
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assignRef",
								target: "r",
								value: "x",
							},
						],
						terminator: { kind: "return", value: "x" },
					},
				],
				"entry",
			);
			// assignRef should not error; we return x to confirm execution continued
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.deepStrictEqual(result, intVal(42));
		});

		it("unbound value returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assignRef",
								target: "r",
								value: "missing",
							},
						],
						terminator: { kind: "return" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});

		it("error-valued value propagates the error", () => {
			const inputs = extendValueEnv(
				emptyValueEnv(),
				"x",
				errorVal("TestErr", "test error"),
			);
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [
							{
								kind: "assignRef",
								target: "r",
								value: "x",
							},
						],
						terminator: { kind: "return" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(
				doc,
				registry,
				effectRegistry,
				inputs,
			);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "TestErr");
			}
		});
	});

	// ===========================================================================
	// 9. Max steps
	// ===========================================================================

	describe("max steps", () => {
		it("loop between blocks exceeds maxSteps returns NonTermination", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "a",
						instructions: [],
						terminator: { kind: "jump", to: "b" },
					},
					{
						id: "b",
						instructions: [],
						terminator: { kind: "jump", to: "a" },
					},
				],
				"a",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry, undefined, {
				maxSteps: 5,
			});
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "NonTermination");
			}
		});

		it("block with many instructions exceeds maxSteps returns NonTermination", () => {
			const instructions = [];
			for (let i = 0; i < 10; i++) {
				instructions.push({
					kind: "assign" as const,
					target: `x${i}`,
					value: {
						kind: "lit" as const,
						type: { kind: "int" as const },
						value: i,
					},
				});
			}
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions,
						terminator: { kind: "return", value: "x0" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry, undefined, {
				maxSteps: 2,
			});
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "NonTermination");
			}
		});
	});

	// ===========================================================================
	// 10. Return terminator
	// ===========================================================================

	describe("return terminator", () => {
		it("void when no value", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [],
						terminator: { kind: "return" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.deepStrictEqual(result, voidVal());
		});

		it("unbound return value returns UnboundIdentifier", () => {
			const doc = makeLIRDoc(
				[
					{
						id: "entry",
						instructions: [],
						terminator: { kind: "return", value: "missing" },
					},
				],
				"entry",
			);
			const { result } = evaluateLIR(doc, registry, effectRegistry);
			assert.equal(result.kind, "error");
			if (result.kind === "error") {
				assert.equal(result.code, "UnboundIdentifier");
			}
		});
	});
});
