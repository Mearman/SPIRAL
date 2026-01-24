// SPDX-License-Identifier: MIT
// SPIRAL Schemas - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	airSchema,
	cirSchema,
	eirSchema,
	lirSchema,
	isAIRSchema,
	isCIRSchema,
	isEIRSchema,
	isLIRSchema,
} from "../src/schemas.js";

//==============================================================================
// Test Fixtures
//==============================================================================

const validAIRSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "AIR Document",
};

const validCIRSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "CIR Document",
};

const validEIRSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "EIR Document",
};

const validLIRSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "LIR Document",
};

const objectWithoutSchema = {
	title: "Some Document",
	type: "object",
};

const nonObjectValues = [
	null,
	undefined,
	"string",
	123,
	true,
	[],
	() => {},
];

//==============================================================================
// Test Suite
//==============================================================================

describe("Schemas - Unit Tests", () => {

	//==========================================================================
	// Schema Structure Tests - AIR
	//==========================================================================

	describe("AIR Schema Structure", () => {
		it("should have $schema property with draft-07", () => {
			assert.strictEqual(airSchema.$schema, "http://json-schema.org/draft-07/schema#");
		});

		it("should have title property", () => {
			assert.strictEqual(airSchema.title, "AIR Document");
		});

		it("should have type object", () => {
			assert.strictEqual(airSchema.type, "object");
		});

		it("should require version, nodes, result, and airDefs", () => {
			assert.ok(Array.isArray(airSchema.required));
			assert.ok(airSchema.required.includes("version"));
			assert.ok(airSchema.required.includes("nodes"));
			assert.ok(airSchema.required.includes("result"));
			assert.ok(airSchema.required.includes("airDefs"));
		});

		it("should have version property with semver pattern", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.version);
			assert.strictEqual(airSchema.properties.version.type, "string");
			assert.ok(airSchema.properties.version.pattern);
			assert.match(airSchema.properties.version.pattern, /\\d+\\.\\d+\\.\\d+/);
		});

		it("should have nodes property as array", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.nodes);
			assert.strictEqual(airSchema.properties.nodes.type, "array");
		});

		it("should have result property with id pattern", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.result);
			assert.strictEqual(airSchema.properties.result.type, "string");
			assert.ok(airSchema.properties.result.pattern);
		});

		it("should have airDefs property as array", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.airDefs);
			assert.strictEqual(airSchema.properties.airDefs.type, "array");
		});

		it("should have optional capabilities property", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.capabilities);
			assert.strictEqual(airSchema.properties.capabilities.type, "array");
		});

		it("should have optional functionSigs property", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.functionSigs);
			assert.strictEqual(airSchema.properties.functionSigs.type, "array");
		});

		it("should have definitions object", () => {
			assert.ok(airSchema.definitions);
			assert.strictEqual(typeof airSchema.definitions, "object");
		});

		it("should have type definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.type);
		});

		it("should have expr definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.expr);
		});

		it("should have airDef definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.airDef);
		});

		it("should have node definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.node);
		});

		it("should have functionSig definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.functionSig);
		});
	});

	//==========================================================================
	// Schema Structure Tests - CIR
	//==========================================================================

	describe("CIR Schema Structure", () => {
		it("should have $schema property with draft-07", () => {
			assert.strictEqual(cirSchema.$schema, "http://json-schema.org/draft-07/schema#");
		});

		it("should have title property", () => {
			assert.strictEqual(cirSchema.title, "CIR Document");
		});

		it("should have type object", () => {
			assert.strictEqual(cirSchema.type, "object");
		});

		it("should require version, nodes, result, and airDefs", () => {
			assert.ok(Array.isArray(cirSchema.required));
			assert.ok(cirSchema.required.includes("version"));
			assert.ok(cirSchema.required.includes("nodes"));
			assert.ok(cirSchema.required.includes("result"));
			assert.ok(cirSchema.required.includes("airDefs"));
		});

		it("should have definitions object", () => {
			assert.ok(cirSchema.definitions);
			assert.strictEqual(typeof cirSchema.definitions, "object");
		});

		it("should have expr definition for CIR expressions", () => {
			assert.ok(cirSchema.definitions);
			assert.ok(cirSchema.definitions.expr);
		});
	});

	//==========================================================================
	// Schema Structure Tests - EIR
	//==========================================================================

	describe("EIR Schema Structure", () => {
		it("should have $schema property with draft-07", () => {
			assert.strictEqual(eirSchema.$schema, "http://json-schema.org/draft-07/schema#");
		});

		it("should have title property", () => {
			assert.strictEqual(eirSchema.title, "EIR Document");
		});

		it("should have type object", () => {
			assert.strictEqual(eirSchema.type, "object");
		});

		it("should require version, nodes, result, and airDefs", () => {
			assert.ok(Array.isArray(eirSchema.required));
			assert.ok(eirSchema.required.includes("version"));
			assert.ok(eirSchema.required.includes("nodes"));
			assert.ok(eirSchema.required.includes("result"));
			assert.ok(eirSchema.required.includes("airDefs"));
		});

		it("should have definitions object", () => {
			assert.ok(eirSchema.definitions);
			assert.strictEqual(typeof eirSchema.definitions, "object");
		});

		it("should have expr definition for EIR expressions", () => {
			assert.ok(eirSchema.definitions);
			assert.ok(eirSchema.definitions.expr);
		});
	});

	//==========================================================================
	// Schema Structure Tests - LIR
	//==========================================================================

	describe("LIR Schema Structure", () => {
		it("should have $schema property with draft-07", () => {
			assert.strictEqual(lirSchema.$schema, "http://json-schema.org/draft-07/schema#");
		});

		it("should have title property", () => {
			assert.strictEqual(lirSchema.title, "LIR Document");
		});

		it("should have type object", () => {
			assert.strictEqual(lirSchema.type, "object");
		});

		it("should require version, blocks, and entry", () => {
			assert.ok(Array.isArray(lirSchema.required));
			assert.ok(lirSchema.required.includes("version"));
			assert.ok(lirSchema.required.includes("blocks"));
			assert.ok(lirSchema.required.includes("entry"));
		});

		it("should have version property with semver pattern", () => {
			assert.ok(lirSchema.properties);
			assert.ok(lirSchema.properties.version);
			assert.strictEqual(lirSchema.properties.version.type, "string");
			assert.ok(lirSchema.properties.version.pattern);
		});

		it("should have blocks property as array", () => {
			assert.ok(lirSchema.properties);
			assert.ok(lirSchema.properties.blocks);
			assert.strictEqual(lirSchema.properties.blocks.type, "array");
		});

		it("should have entry property with id pattern", () => {
			assert.ok(lirSchema.properties);
			assert.ok(lirSchema.properties.entry);
			assert.strictEqual(lirSchema.properties.entry.type, "string");
			assert.ok(lirSchema.properties.entry.pattern);
		});

		it("should have optional capabilities property", () => {
			assert.ok(lirSchema.properties);
			assert.ok(lirSchema.properties.capabilities);
			assert.strictEqual(lirSchema.properties.capabilities.type, "array");
		});
	});

	//==========================================================================
	// Type Guard Tests - isAIRSchema
	//==========================================================================

	describe("isAIRSchema", () => {
		it("should return true for valid AIR schema object", () => {
			assert.strictEqual(isAIRSchema(validAIRSchema), true);
		});

		it("should return true for CIR schema object", () => {
			assert.strictEqual(isAIRSchema(validCIRSchema), true);
		});

		it("should return true for EIR schema object", () => {
			assert.strictEqual(isAIRSchema(validEIRSchema), true);
		});

		it("should return true for LIR schema object", () => {
			assert.strictEqual(isAIRSchema(validLIRSchema), true);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isAIRSchema(objectWithoutSchema), false);
		});

		it("should return false for null", () => {
			assert.strictEqual(isAIRSchema(null), false);
		});

		it("should return false for undefined", () => {
			assert.strictEqual(isAIRSchema(undefined), false);
		});

		it("should return false for string", () => {
			assert.strictEqual(isAIRSchema("string"), false);
		});

		it("should return false for number", () => {
			assert.strictEqual(isAIRSchema(123), false);
		});

		it("should return false for boolean", () => {
			assert.strictEqual(isAIRSchema(true), false);
		});

		it("should return false for array", () => {
			assert.strictEqual(isAIRSchema([]), false);
		});

		it("should return false for function", () => {
			assert.strictEqual(isAIRSchema(() => {}), false);
		});
	});

	//==========================================================================
	// Type Guard Tests - isCIRSchema
	//==========================================================================

	describe("isCIRSchema", () => {
		it("should return true for valid CIR schema object", () => {
			assert.strictEqual(isCIRSchema(validCIRSchema), true);
		});

		it("should return true for AIR schema object", () => {
			assert.strictEqual(isCIRSchema(validAIRSchema), true);
		});

		it("should return true for EIR schema object", () => {
			assert.strictEqual(isCIRSchema(validEIRSchema), true);
		});

		it("should return true for LIR schema object", () => {
			assert.strictEqual(isCIRSchema(validLIRSchema), true);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isCIRSchema(objectWithoutSchema), false);
		});

		it("should return false for null", () => {
			assert.strictEqual(isCIRSchema(null), false);
		});

		it("should return false for undefined", () => {
			assert.strictEqual(isCIRSchema(undefined), false);
		});

		it("should return false for string", () => {
			assert.strictEqual(isCIRSchema("string"), false);
		});

		it("should return false for number", () => {
			assert.strictEqual(isCIRSchema(123), false);
		});

		it("should return false for boolean", () => {
			assert.strictEqual(isCIRSchema(true), false);
		});

		it("should return false for array", () => {
			assert.strictEqual(isCIRSchema([]), false);
		});

		it("should return false for function", () => {
			assert.strictEqual(isCIRSchema(() => {}), false);
		});
	});

	//==========================================================================
	// Type Guard Tests - isEIRSchema
	//==========================================================================

	describe("isEIRSchema", () => {
		it("should return true for valid EIR schema object", () => {
			assert.strictEqual(isEIRSchema(validEIRSchema), true);
		});

		it("should return true for AIR schema object", () => {
			assert.strictEqual(isEIRSchema(validAIRSchema), true);
		});

		it("should return true for CIR schema object", () => {
			assert.strictEqual(isEIRSchema(validCIRSchema), true);
		});

		it("should return true for LIR schema object", () => {
			assert.strictEqual(isEIRSchema(validLIRSchema), true);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isEIRSchema(objectWithoutSchema), false);
		});

		it("should return false for null", () => {
			assert.strictEqual(isEIRSchema(null), false);
		});

		it("should return false for undefined", () => {
			assert.strictEqual(isEIRSchema(undefined), false);
		});

		it("should return false for string", () => {
			assert.strictEqual(isEIRSchema("string"), false);
		});

		it("should return false for number", () => {
			assert.strictEqual(isEIRSchema(123), false);
		});

		it("should return false for boolean", () => {
			assert.strictEqual(isEIRSchema(true), false);
		});

		it("should return false for array", () => {
			assert.strictEqual(isEIRSchema([]), false);
		});

		it("should return false for function", () => {
			assert.strictEqual(isEIRSchema(() => {}), false);
		});
	});

	//==========================================================================
	// Type Guard Tests - isLIRSchema
	//==========================================================================

	describe("isLIRSchema", () => {
		it("should return true for valid LIR schema object", () => {
			assert.strictEqual(isLIRSchema(validLIRSchema), true);
		});

		it("should return true for AIR schema object", () => {
			assert.strictEqual(isLIRSchema(validAIRSchema), true);
		});

		it("should return true for CIR schema object", () => {
			assert.strictEqual(isLIRSchema(validCIRSchema), true);
		});

		it("should return true for EIR schema object", () => {
			assert.strictEqual(isLIRSchema(validEIRSchema), true);
		});

		it("should return false for object without $schema", () => {
			assert.strictEqual(isLIRSchema(objectWithoutSchema), false);
		});

		it("should return false for null", () => {
			assert.strictEqual(isLIRSchema(null), false);
		});

		it("should return false for undefined", () => {
			assert.strictEqual(isLIRSchema(undefined), false);
		});

		it("should return false for string", () => {
			assert.strictEqual(isLIRSchema("string"), false);
		});

		it("should return false for number", () => {
			assert.strictEqual(isLIRSchema(123), false);
		});

		it("should return false for boolean", () => {
			assert.strictEqual(isLIRSchema(true), false);
		});

		it("should return false for array", () => {
			assert.strictEqual(isLIRSchema([]), false);
		});

		it("should return false for function", () => {
			assert.strictEqual(isLIRSchema(() => {}), false);
		});
	});

	//==========================================================================
	// Schema Definition Content Tests
	//==========================================================================

	describe("Schema Definitions", () => {
		it("AIR schema should have oneOf in type definition", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.type);
			assert.ok(airSchema.definitions.type.oneOf);
			assert.ok(Array.isArray(airSchema.definitions.type.oneOf));
		});

		it("CIR schema should have oneOf in type definition", () => {
			assert.ok(cirSchema.definitions);
			assert.ok(cirSchema.definitions.type);
			assert.ok(cirSchema.definitions.type.oneOf);
			assert.ok(Array.isArray(cirSchema.definitions.type.oneOf));
		});

		it("EIR schema should have oneOf in expr definition", () => {
			assert.ok(eirSchema.definitions);
			assert.ok(eirSchema.definitions.expr);
			assert.ok(eirSchema.definitions.expr.oneOf);
			assert.ok(Array.isArray(eirSchema.definitions.expr.oneOf));
		});

		it("AIR expr definition should have oneOf", () => {
			assert.ok(airSchema.definitions);
			assert.ok(airSchema.definitions.expr);
			assert.ok(airSchema.definitions.expr.oneOf);
			assert.ok(Array.isArray(airSchema.definitions.expr.oneOf));
		});

		it("CIR expr definition should have oneOf with more expressions than AIR", () => {
			assert.ok(airSchema.definitions);
			assert.ok(cirSchema.definitions);
			assert.ok(airSchema.definitions.expr.oneOf);
			assert.ok(cirSchema.definitions.expr.oneOf);
			const airExprCount = airSchema.definitions.expr.oneOf.length;
			const cirExprCount = cirSchema.definitions.expr.oneOf.length;
			assert.ok(cirExprCount > airExprCount);
		});

		it("EIR expr definition should have oneOf with more expressions than CIR", () => {
			assert.ok(cirSchema.definitions);
			assert.ok(eirSchema.definitions);
			assert.ok(cirSchema.definitions.expr.oneOf);
			assert.ok(eirSchema.definitions.expr.oneOf);
			const cirExprCount = cirSchema.definitions.expr.oneOf.length;
			const eirExprCount = eirSchema.definitions.expr.oneOf.length;
			assert.ok(eirExprCount > cirExprCount);
		});

		it("LIR instruction schema should have oneOf", () => {
			assert.ok(lirSchema.definitions);
			assert.ok(lirSchema.blocks);
			const itemsSchema = lirSchema.properties.blocks.items;
			assert.ok(itemsSchema);
			assert.ok(itemsSchema.properties);
			assert.ok(itemsSchema.properties.instructions);
			assert.ok(itemsSchema.properties.instructions.items);
			assert.ok(itemsSchema.properties.instructions.items.oneOf);
		});

		it("LIR terminator schema should have oneOf", () => {
			assert.ok(lirSchema.definitions);
			assert.ok(lirSchema.blocks);
			const itemsSchema = lirSchema.properties.blocks.items;
			assert.ok(itemsSchema);
			assert.ok(itemsSchema.properties);
			assert.ok(itemsSchema.properties.terminator);
			assert.ok(itemsSchema.properties.terminator.oneOf);
		});
	});

	//==========================================================================
	// Schema Property Pattern Tests
	//==========================================================================

	describe("Schema Property Patterns", () => {
		it("AIR schema should use additionalProperties false", () => {
			assert.strictEqual(airSchema.additionalProperties, false);
		});

		it("CIR schema should use additionalProperties false", () => {
			assert.strictEqual(cirSchema.additionalProperties, false);
		});

		it("EIR schema should use additionalProperties false", () => {
			assert.strictEqual(eirSchema.additionalProperties, false);
		});

		it("LIR schema should use additionalProperties false", () => {
			assert.strictEqual(lirSchema.additionalProperties, false);
		});

		it("AIR schema should have description fields", () => {
			assert.ok(airSchema.properties);
			assert.ok(airSchema.properties.version.description);
			assert.ok(airSchema.properties.nodes.description);
			assert.ok(airSchema.properties.result.description);
			assert.ok(airSchema.properties.airDefs.description);
		});

		it("CIR schema should have description fields", () => {
			assert.ok(cirSchema.properties);
			assert.ok(cirSchema.properties.version.description);
			assert.ok(cirSchema.properties.nodes.description);
			assert.ok(cirSchema.properties.result.description);
			assert.ok(cirSchema.properties.airDefs.description);
		});

		it("EIR schema should have description fields", () => {
			assert.ok(eirSchema.properties);
			assert.ok(eirSchema.properties.version.description);
			assert.ok(eirSchema.properties.nodes.description);
			assert.ok(eirSchema.properties.result.description);
			assert.ok(eirSchema.properties.airDefs.description);
		});

		it("LIR schema should have description fields", () => {
			assert.ok(lirSchema.properties);
			assert.ok(lirSchema.properties.version.description);
			assert.ok(lirSchema.properties.blocks.description);
			assert.ok(lirSchema.properties.entry.description);
		});
	});

	//==========================================================================
	// Schema Consistency Tests
	//==========================================================================

	describe("Schema Consistency", () => {
		it("all schemas should use the same JSON Schema version", () => {
			assert.strictEqual(airSchema.$schema, cirSchema.$schema);
			assert.strictEqual(airSchema.$schema, eirSchema.$schema);
			assert.strictEqual(airSchema.$schema, lirSchema.$schema);
		});

		it("all schemas should have semver pattern for version", () => {
			assert.ok(airSchema.properties.version.pattern);
			assert.ok(cirSchema.properties.version.pattern);
			assert.ok(eirSchema.properties.version.pattern);
			assert.ok(lirSchema.properties.version.pattern);
			assert.strictEqual(
				airSchema.properties.version.pattern,
				cirSchema.properties.version.pattern,
			);
			assert.strictEqual(
				airSchema.properties.version.pattern,
				eirSchema.properties.version.pattern,
			);
			assert.strictEqual(
				airSchema.properties.version.pattern,
				lirSchema.properties.version.pattern,
			);
		});

		it("all schemas should use same id pattern", () => {
			const idPattern = "^[a-zA-Z_][a-zA-Z0-9_]*$";
			assert.strictEqual(airSchema.properties.result.pattern, idPattern);
			assert.strictEqual(cirSchema.properties.result.pattern, idPattern);
			assert.strictEqual(eirSchema.properties.result.pattern, idPattern);
			assert.strictEqual(lirSchema.properties.entry.pattern, idPattern);
		});
	});
});
