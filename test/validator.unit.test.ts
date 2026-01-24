// SPDX-License-Identifier: MIT
// SPIRAL Validator - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	validateAIR,
	validateCIR,
	validateEIR,
	validateLIR,
	validatePIR,
} from "../src/validator.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	LIRDocument,
	PIRDocument,
} from "../src/types.js";

//==============================================================================
// Test Fixtures - Valid Documents
//==============================================================================

const validAIRDoc: AIRDocument = {
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
			id: "x",
			expr: { kind: "lit", type: { kind: "int" }, value: 5 },
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "int" }, value: 10 },
		},
		{
			id: "sum",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["x", "y"],
			},
		},
	],
	result: "sum",
};

const validCIRDoc: CIRDocument = {
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
			id: "zero",
			expr: { kind: "lit", type: { kind: "int" }, value: 0 },
		},
		{
			id: "identity",
			expr: {
				kind: "lambda",
				params: ["x"],
				body: "identityBody",
				type: {
					kind: "fn",
					params: [{ kind: "int" }],
					returns: { kind: "int" },
				},
			},
		},
		{
			id: "identityBody",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["x", "zero"],
			},
		},
		{
			id: "result",
			expr: {
				kind: "callExpr",
				fn: "identity",
				args: [{ kind: "lit", type: { kind: "int" }, value: 42 }],
			},
		},
	],
	result: "result",
};

const validEIRDoc: EIRDocument = {
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
			id: "zero",
			expr: { kind: "lit", type: { kind: "int" }, value: 0 },
		},
		{
			id: "init",
			expr: { kind: "assign", target: "x", value: "zero" },
		},
		{
			id: "incr",
			expr: {
				kind: "assign",
				target: "x",
				value: {
					kind: "call",
					ns: "core",
					name: "add",
					args: ["x", { kind: "lit", type: { kind: "int" }, value: 1 }],
				},
			},
		},
	],
	result: "incr",
};

const validLIRDoc: LIRDocument = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			blocks: [
				{
					id: "entry",
					instructions: [
						{
							kind: "assign",
							target: "x",
							value: { kind: "lit", type: { kind: "int" }, value: 10 },
						},
						{
							kind: "assign",
							target: "y",
							value: { kind: "lit", type: { kind: "int" }, value: 20 },
						},
						{
							kind: "op",
							target: "sum",
							ns: "core",
							name: "add",
							args: ["x", "y"],
						},
					],
					terminator: { kind: "return", value: "sum" },
				},
			],
			entry: "entry",
		},
	],
	result: "main",
};

const validPIRDoc: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "taskBody",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
		{
			id: "spawned",
			expr: { kind: "spawn", task: "taskBody" },
		},
		{
			id: "result",
			expr: { kind: "await", future: "spawned" },
		},
	],
	result: "result",
};

//==============================================================================
// Test Fixtures - Invalid Documents
//==============================================================================

const invalidMissingVersion = { airDefs: [], nodes: [], result: "x" };

const invalidBadVersion = {
	version: "not-a-semver",
	airDefs: [],
	nodes: [],
	result: "x",
};

const invalidNotObject = "not an object";

const invalidMissingNodes = {
	version: "1.0.0",
	result: "x",
};

const invalidNodesNotArray = {
	version: "1.0.0",
	nodes: "not an array",
	result: "x",
};

const invalidMissingResult = {
	version: "1.0.0",
	airDefs: [],
	nodes: [{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 1 } }],
};

const invalidDuplicateNodeId = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
		{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
	],
	result: "x",
};

const invalidBadNodeId = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{ id: "123invalid", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
	],
	result: "123invalid",
};

const invalidResultReferencesNonExistent = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
	],
	result: "nonexistent",
};

const invalidAirDefMissingNs = {
	version: "1.0.0",
	airDefs: [
		{
			// @ts-expect-error - intentionally missing ns
			name: "add",
			params: ["a"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [],
	result: "x",
};

const invalidAirDefBadParams = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: "not an array",
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [],
	result: "x",
};

const invalidExprMissingKind = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: { type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidExprUnknownKind = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: {
				// @ts-expect-error - intentionally invalid kind
				kind: "unknownKind",
			},
		},
	],
	result: "x",
};

const invalidTypeMissingKind = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: {
				kind: "lit",
				// @ts-expect-error - intentionally missing kind
				type: { of: { kind: "int" } },
				value: 1,
			},
		},
	],
	result: "x",
};

const invalidTypeUnknownKind = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: {
				kind: "lit",
				// @ts-expect-error - intentionally invalid kind
				type: { kind: "unknownType" },
				value: 1,
			},
		},
	],
	result: "x",
};

const invalidCallMissingArgs = {
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
			id: "x",
			// @ts-expect-error - intentionally missing args
			expr: { kind: "call", ns: "core", name: "add" },
		},
	],
	result: "x",
};

const invalidRefMissingId = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally missing id
			expr: { kind: "ref" },
		},
	],
	result: "x",
};

const invalidIfMissingCond = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally missing cond
			expr: {
				kind: "if",
				then: "y",
				else: "z",
				type: { kind: "int" },
			},
		},
	],
	result: "x",
};

const invalidLambdaMissingParams = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally missing params
			expr: {
				kind: "lambda",
				body: "y",
				type: {
					kind: "fn",
					params: [{ kind: "int" }],
					returns: { kind: "int" },
				},
			},
		},
	],
	result: "x",
};

const invalidLambdaInAIR = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: {
				kind: "lambda",
				params: ["p"],
				body: "y",
				type: {
					kind: "fn",
					params: [{ kind: "int" }],
					returns: { kind: "int" },
				},
			},
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidFixInAIR = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: {
				kind: "fix",
				fn: "y",
				type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
			},
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidEIRAssignMissingTarget = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally missing target
			expr: { kind: "assign", value: "y" },
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidEIRWhileMissingCond = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally missing cond
			expr: { kind: "while", body: "y" },
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "void" }, value: null },
		},
	],
	result: "x",
};

const invalidLIRBlockMissingInstructions = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			blocks: [
				{
					id: "entry",
					// @ts-expect-error - intentionally missing instructions
					terminator: { kind: "return" },
				},
			],
			entry: "entry",
		},
	],
	result: "main",
};

const invalidLIRBlockMissingTerminator = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			blocks: [
				{
					id: "entry",
					instructions: [],
					// @ts-expect-error - intentionally missing terminator
				},
			],
			entry: "entry",
		},
	],
	result: "main",
};

const invalidLIRBlockInvalidTerminator = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			blocks: [
				{
					id: "entry",
					instructions: [],
					terminator: {
						// @ts-expect-error - intentionally invalid kind
						kind: "invalidTerm",
					},
				},
			],
			entry: "entry",
		},
	],
	result: "main",
};

const invalidLIRJumpToNonExistentBlock = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			blocks: [
				{
					id: "entry",
					instructions: [],
					terminator: { kind: "jump", to: "nonexistent" },
				},
			],
			entry: "entry",
		},
	],
	result: "main",
};

const invalidPIRWrongVersion = {
	version: "1.0.0", // Should be 2.x.x
	nodes: [
		{
			id: "x",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidPIRInvalidCapability = {
	version: "2.0.0",
	capabilities: ["invalidCap"],
	nodes: [
		{
			id: "x",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "x",
};

const invalidPIRExprUnknownKind = {
	version: "2.0.0",
	nodes: [
		{
			id: "x",
			// @ts-expect-error - intentionally invalid kind
			expr: { kind: "unknownPIRKind" },
		},
	],
	result: "x",
};

const invalidCyclicReference = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "a",
			expr: { kind: "ref", id: "b" },
		},
		{
			id: "b",
			expr: { kind: "ref", id: "a" },
		},
	],
	result: "a",
};

const validRecursiveWithLambda = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "factorial",
			expr: {
				kind: "lambda",
				params: ["n"],
				body: "factorialBody",
				type: {
					kind: "fn",
					params: [{ kind: "int" }],
					returns: { kind: "int" },
				},
			},
		},
		{
			id: "factorialBody",
			expr: {
				kind: "if",
				cond: "isZero",
				then: "one",
				else: "recursiveCall",
				type: { kind: "int" },
			},
		},
		{
			id: "isZero",
			expr: {
				kind: "call",
				ns: "core",
				name: "eq",
				args: ["n", { kind: "lit", type: { kind: "int" }, value: 0 }],
			},
		},
		{
			id: "one",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "recursiveCall",
			expr: {
				kind: "call",
				ns: "core",
				name: "mul",
				args: [
					"n",
					{
						kind: "callExpr",
						fn: "factorial",
						args: [
							{
								kind: "call",
								ns: "core",
								name: "sub",
								args: ["n", { kind: "lit", type: { kind: "int" }, value: 1 }],
							},
						],
					},
				],
			},
		},
	],
	result: "factorial",
};

//==============================================================================
// Test Suite
//==============================================================================

describe("Validator - Unit Tests", () => {
	//==========================================================================
	// AIR Validator Tests
	//==========================================================================

	describe("validateAIR", () => {
		it("should accept valid AIR document", () => {
			const result = validateAIR(validAIRDoc);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should reject non-object input", () => {
			const result = validateAIR(invalidNotObject);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("must be an object")));
		});

		it("should reject missing version", () => {
			const result = validateAIR(invalidMissingVersion);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("version")));
		});

		it("should reject invalid semver", () => {
			const result = validateAIR(invalidBadVersion);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("version")));
		});

		it("should reject missing nodes array", () => {
			const result = validateAIR(invalidMissingNodes);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("nodes")));
		});

		it("should reject non-array nodes", () => {
			const result = validateAIR(invalidNodesNotArray);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("nodes")));
		});

		it("should reject missing result", () => {
			const result = validateAIR(invalidMissingResult);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("result")));
		});

		it("should reject duplicate node IDs", () => {
			const result = validateAIR(invalidDuplicateNodeId);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("Duplicate")));
		});

		it("should reject invalid node ID format", () => {
			const result = validateAIR(invalidBadNodeId);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("id")));
		});

		it("should reject result referencing non-existent node", () => {
			const result = validateAIR(invalidResultReferencesNonExistent);
			assert.ok(!result.valid);
			assert.ok(
				result.errors.some((e) => e.message.includes("non-existent")),
			);
		});

		it("should reject airDef missing ns", () => {
			const result = validateAIR(invalidAirDefMissingNs);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("airDefs")));
		});

		it("should reject airDef with invalid params", () => {
			const result = validateAIR(invalidAirDefBadParams);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("params")));
		});

		it("should reject expression without kind", () => {
			const result = validateAIR(invalidExprMissingKind);
			assert.ok(!result.valid);
		});

		it("should reject expression with unknown kind", () => {
			const result = validateAIR(invalidExprUnknownKind);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("Unknown")));
		});

		it("should reject type without kind", () => {
			const result = validateAIR(invalidTypeMissingKind);
			assert.ok(!result.valid);
		});

		it("should reject type with unknown kind", () => {
			const result = validateAIR(invalidTypeUnknownKind);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("Unknown type")));
		});

		it("should reject call without args", () => {
			const result = validateAIR(invalidCallMissingArgs);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("args")));
		});

		it("should reject ref without id", () => {
			const result = validateAIR(invalidRefMissingId);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("id")));
		});

		it("should reject if without cond", () => {
			const result = validateAIR(invalidIfMissingCond);
			assert.ok(!result.valid);
		});

		it("should reject cyclic references", () => {
			const result = validateAIR(invalidCyclicReference);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("cycle")));
		});

		it("should accept valid recursion through lambda", () => {
			const result = validateAIR(validRecursiveWithLambda);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// CIR Validator Tests
	//==========================================================================

	describe("validateCIR", () => {
		it("should accept valid CIR document", () => {
			const result = validateCIR(validCIRDoc);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept lambda expressions", () => {
			const result = validateCIR(validCIRDoc);
			assert.ok(result.valid);
		});

		it("should accept callExpr expressions", () => {
			const result = validateCIR(validCIRDoc);
			assert.ok(result.valid);
		});

		it("should reject lambda in AIR document", () => {
			const result = validateAIR(invalidLambdaInAIR);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("lambda")));
		});

		it("should reject lambda missing params", () => {
			const result = validateCIR(invalidLambdaMissingParams);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("params")));
		});

		it("should reject fix in AIR document", () => {
			const result = validateAIR(invalidFixInAIR);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("fix")));
		});

		it("should accept fix in CIR document", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "identity",
						expr: {
							kind: "lambda",
							params: ["x"],
							body: "identityBody",
							type: {
								kind: "fn",
								params: [{ kind: "int" }],
								returns: { kind: "int" },
							},
						},
					},
					{
						id: "identityBody",
						expr: { kind: "ref", id: "x" },
					},
					{
						id: "result",
						expr: {
							kind: "fix",
							fn: "identity",
							type: {
								kind: "fn",
								params: [{ kind: "int" }],
								returns: { kind: "int" },
							},
						},
					},
				],
				result: "result",
			};
			const result = validateCIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// EIR Validator Tests
	//==========================================================================

	describe("validateEIR", () => {
		it("should accept valid EIR document", () => {
			const result = validateEIR(validEIRDoc);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept assign expression", () => {
			const result = validateEIR(validEIRDoc);
			assert.ok(result.valid);
		});

		it("should accept inline expressions in assign", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "assign",
							target: "y",
							value: { kind: "lit", type: { kind: "int" }, value: 42 },
						},
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should reject assign missing target", () => {
			const result = validateEIR(invalidEIRAssignMissingTarget);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("target")));
		});

		it("should accept seq expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "seq",
							first: "a",
							then: "b",
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept while expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "loop",
						expr: {
							kind: "while",
							cond: "cond",
							body: "body",
						},
					},
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: false },
					},
					{
						id: "body",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
				],
				result: "loop",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should reject while missing cond", () => {
			const result = validateEIR(invalidEIRWhileMissingCond);
			assert.ok(!result.valid);
		});

		it("should accept for expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "loop",
						expr: {
							kind: "for",
							var: "i",
							init: "init",
							cond: "cond",
							update: "update",
							body: "body",
						},
					},
					{
						id: "init",
						expr: { kind: "lit", type: { kind: "int" }, value: 0 },
					},
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: false },
					},
					{
						id: "update",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "body",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
				],
				result: "loop",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept iter expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "loop",
						expr: {
							kind: "iter",
							var: "x",
							iter: "iterable",
							body: "body",
						},
					},
					{
						id: "iterable",
						expr: {
							kind: "lit",
							type: { kind: "list", of: { kind: "int" } },
							value: [],
						},
					},
					{
						id: "body",
						expr: { kind: "lit", type: { kind: "void" }, value: null },
					},
				],
				result: "loop",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept effect expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "effect",
							op: "print",
							args: ["a"],
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "string" }, value: "hello" },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept try expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "try",
							tryBody: "tryBody",
							catchParam: "err",
							catchBody: "catchBody",
						},
					},
					{
						id: "tryBody",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "catchBody",
						expr: { kind: "lit", type: { kind: "int" }, value: -1 },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept refCell expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "refCell",
							target: "y",
						},
					},
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});

		it("should accept deref expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "deref",
							target: "y",
						},
					},
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// LIR Validator Tests
	//==========================================================================

	describe("validateLIR", () => {
		it("should accept valid LIR document", () => {
			const result = validateLIR(validLIRDoc);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should accept block nodes with instructions and terminators", () => {
			const result = validateLIR(validLIRDoc);
			assert.ok(result.valid);
		});

		it("should reject block missing instructions", () => {
			const result = validateLIR(invalidLIRBlockMissingInstructions);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("instructions")));
		});

		it("should reject block missing terminator", () => {
			const result = validateLIR(invalidLIRBlockMissingTerminator);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("terminator")));
		});

		it("should reject invalid terminator kind", () => {
			const result = validateLIR(invalidLIRBlockInvalidTerminator);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("terminator")));
		});

		it("should reject jump to non-existent block", () => {
			const result = validateLIR(invalidLIRJumpToNonExistentBlock);
			assert.ok(!result.valid);
			assert.ok(
				result.errors.some((e) => e.message.includes("non-existent")),
			);
		});

		it("should accept jump terminator", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "jump", to: "next" },
							},
							{
								id: "next",
								instructions: [],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept branch terminator", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "branch", cond: "c", then: "t", else: "e" },
							},
							{
								id: "t",
								instructions: [],
								terminator: { kind: "return" },
							},
							{
								id: "e",
								instructions: [],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept return terminator", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "return", value: "x" },
							},
						],
						entry: "entry",
					},
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept exit terminator", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "exit", code: 0 },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept assign instruction", () => {
			const result = validateLIR(validLIRDoc);
			assert.ok(result.valid);
		});

		it("should accept op instruction", () => {
			const result = validateLIR(validLIRDoc);
			assert.ok(result.valid);
		});

		it("should accept phi instruction", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "phi",
										target: "x",
										sources: [
											{ block: "a", value: "1" },
											{ block: "b", value: "2" },
										],
									},
								],
								terminator: { kind: "branch", cond: "c", then: "a", else: "b" },
							},
							{
								id: "a",
								instructions: [],
								terminator: { kind: "jump", to: "merge" },
							},
							{
								id: "b",
								instructions: [],
								terminator: { kind: "jump", to: "merge" },
							},
							{
								id: "merge",
								instructions: [],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept call instruction", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "call",
										target: "result",
										callee: "func",
										args: ["a", "b"],
									},
								],
								terminator: { kind: "return", value: "result" },
							},
						],
						entry: "entry",
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept effect instruction", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "effect",
										op: "print",
										args: ["msg"],
									},
								],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
					{
						id: "msg",
						expr: { kind: "lit", type: { kind: "string" }, value: "hello" },
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept assignRef instruction", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "assignRef",
										target: "x",
										value: "y",
									},
								],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// PIR Validator Tests
	//==========================================================================

	describe("validatePIR", () => {
		it("should accept valid PIR document", () => {
			const result = validatePIR(validPIRDoc);
			assert.ok(result.valid);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should require version 2.x.x", () => {
			const result = validatePIR(invalidPIRWrongVersion);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.path.includes("version")));
		});

		it("should accept valid capabilities", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				capabilities: ["async", "parallel", "channels", "hybrid"],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should reject invalid capability", () => {
			const result = validatePIR(invalidPIRInvalidCapability);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("capability")));
		});

		it("should accept spawn expression", () => {
			const result = validatePIR(validPIRDoc);
			assert.ok(result.valid);
		});

		it("should accept await expression", () => {
			const result = validatePIR(validPIRDoc);
			assert.ok(result.valid);
		});

		it("should accept par expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "par",
							branches: ["a", "b"],
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should accept channel expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "channel",
							channelType: "mpsc",
						},
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should accept send expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "send",
							channel: "ch",
							value: "msg",
						},
					},
					{
						id: "ch",
						expr: { kind: "lit", type: { kind: "channel" }, value: null },
					},
					{
						id: "msg",
						expr: { kind: "lit", type: { kind: "string" }, value: "hello" },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should accept recv expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "recv",
							channel: "ch",
						},
					},
					{
						id: "ch",
						expr: { kind: "lit", type: { kind: "channel" }, value: null },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should accept select expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "select",
							futures: ["a", "b"],
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should accept race expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "x",
						expr: {
							kind: "race",
							tasks: ["a", "b"],
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
				],
				result: "x",
			};
			const result = validatePIR(doc);
			assert.ok(result.valid);
		});

		it("should reject unknown PIR expression kind", () => {
			const result = validatePIR(invalidPIRExprUnknownKind);
			assert.ok(!result.valid);
			assert.ok(result.errors.some((e) => e.message.includes("Unknown")));
		});
	});

	//==========================================================================
	// Type Validation Tests
	//==========================================================================

	describe("Type Validation", () => {
		it("should accept primitive types", () => {
			const types: Array<{ kind: string }> = [
				{ kind: "bool" },
				{ kind: "int" },
				{ kind: "float" },
				{ kind: "string" },
			];
			for (const type of types) {
				const doc: AIRDocument = {
					version: "1.0.0",
					airDefs: [],
					nodes: [
						{
							id: "x",
							expr: { kind: "lit", type, value: null },
						},
					],
					result: "x",
				};
				const result = validateAIR(doc);
				assert.ok(result.valid, `Failed for type: ${type.kind}`);
			}
		});

		it("should accept set type", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "set", of: { kind: "int" } },
							value: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept list type", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "list", of: { kind: "int" } },
							value: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept map type", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: {
								kind: "map",
								key: { kind: "string" },
								value: { kind: "int" },
							},
							value: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept option type", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "option", of: { kind: "int" } },
							value: null,
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept opaque type", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "opaque", name: "MyType" },
							value: null,
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept fn type", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lambda",
							params: ["p"],
							body: "y",
							type: {
								kind: "fn",
								params: [{ kind: "int" }],
								returns: { kind: "int" },
							},
						},
					},
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validateCIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// Optional Fields Tests
	//==========================================================================

	describe("Optional Fields", () => {
		it("should accept document with capabilities", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				capabilities: [],
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept document with functionSigs", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				functionSigs: [],
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept return terminator without value", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "return" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept exit terminator without code", () => {
			const doc: LIRDocument = {
				version: "1.0.0",
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "exit" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateLIR(doc);
			assert.ok(result.valid);
		});

		it("should accept try expression without fallback", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "try",
							tryBody: "tryBody",
							catchParam: "err",
							catchBody: "catchBody",
						},
					},
					{
						id: "tryBody",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "catchBody",
						expr: { kind: "lit", type: { kind: "int" }, value: -1 },
					},
				],
				result: "x",
			};
			const result = validateEIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// Hybrid Document Tests (Expression + Block Nodes)
	//==========================================================================

	describe("Hybrid Documents", () => {
		it("should accept AIR document with expression nodes", () => {
			const result = validateAIR(validAIRDoc);
			assert.ok(result.valid);
		});

		it("should accept AIR document with block nodes", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "main",
						blocks: [
							{
								id: "entry",
								instructions: [
									{
										kind: "assign",
										target: "x",
										value: { kind: "lit", type: { kind: "int" }, value: 10 },
									},
								],
								terminator: { kind: "return", value: "x" },
							},
						],
						entry: "entry",
					},
				],
				result: "main",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept mixed expression and block nodes", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "exprNode",
						expr: { kind: "lit", type: { kind: "int" }, value: 42 },
					},
					{
						id: "blockNode",
						blocks: [
							{
								id: "entry",
								instructions: [],
								terminator: { kind: "return", value: "exprNode" },
							},
						],
						entry: "entry",
					},
				],
				result: "blockNode",
			};
			const result = validateCIR(doc);
			assert.ok(result.valid);
		});
	});

	//==========================================================================
	// Edge Cases
	//==========================================================================

	describe("Edge Cases", () => {
		it("should accept empty nodes array", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(!result.valid); // result should reference non-existent node
		});

		it("should accept empty airDefs array", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept empty args array in call", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [
					{
						ns: "core",
						name: "nop",
						params: [],
						result: { kind: "int" },
						body: { kind: "lit", type: { kind: "int" }, value: 0 },
					},
				],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "call",
							ns: "core",
							name: "nop",
							args: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept let expression with inline expressions", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "let",
							name: "y",
							value: { kind: "lit", type: { kind: "int" }, value: 10 },
							body: { kind: "lit", type: { kind: "int" }, value: 20 },
						},
					},
				],
				result: "x",
			};
			const result = validateCIR(doc);
			assert.ok(result.valid);
		});

		it("should accept lambda with optional params", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lambda",
							params: [
								{ name: "a", optional: true },
								{ name: "b", optional: false, default: { kind: "lit", type: { kind: "int" }, value: 5 } },
							],
							body: "y",
							type: {
								kind: "fn",
								params: [{ kind: "int" }, { kind: "int" }],
								returns: { kind: "int" },
							},
						},
					},
					{
						id: "y",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
				],
				result: "x",
			};
			const result = validateCIR(doc);
			assert.ok(result.valid);
		});

		it("should accept set type with elem property", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "set", elem: { kind: "int" } },
							value: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});

		it("should accept set type with elementType property", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: {
							kind: "lit",
							type: { kind: "set", elementType: { kind: "int" } },
							value: [],
						},
					},
				],
				result: "x",
			};
			const result = validateAIR(doc);
			assert.ok(result.valid);
		});
	});
});
