// SPIRAL String Domain
// String manipulation operators

import { SPIRALError } from "../errors.js";
import type { Value } from "../types.js";
import {
	boolType,
	boolVal,
	intType,
	intVal,
	isError,
	listType,
	listVal,
	opaqueType,
	stringType,
	stringVal,
} from "../types.js";
import {
	defineOperator,
	Operator,
	OperatorRegistry,
	registerOperator,
} from "./registry.js";

//==============================================================================
// Helper Functions
//==============================================================================

function expectString(v: Value): string {
	if (v.kind === "string") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(stringType, opaqueType(v.kind));
}

function expectInt(v: Value): number {
	if (v.kind === "int") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(intType, opaqueType(v.kind));
}

//==============================================================================
// String Operators
//==============================================================================

// concat(string, string) -> string
const concat: Operator = defineOperator("string", "concat")
	.setParams(stringType, stringType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return stringVal(expectString(a) + expectString(b));
	})
	.build();

// length(string) -> int
const length: Operator = defineOperator("string", "length")
	.setParams(stringType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return intVal(expectString(a).length);
	})
	.build();

// slice(string, int, int) -> string
const slice: Operator = defineOperator("string", "slice")
	.setParams(stringType, intType, intType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a, b, c) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (isError(c)) return c;
		return stringVal(expectString(a).slice(expectInt(b), expectInt(c)));
	})
	.build();

// indexOf(string, string) -> int
const indexOf: Operator = defineOperator("string", "indexOf")
	.setParams(stringType, stringType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return intVal(expectString(a).indexOf(expectString(b)));
	})
	.build();

// toUpper(string) -> string
const toUpper: Operator = defineOperator("string", "toUpper")
	.setParams(stringType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return stringVal(expectString(a).toUpperCase());
	})
	.build();

// toLower(string) -> string
const toLower: Operator = defineOperator("string", "toLower")
	.setParams(stringType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return stringVal(expectString(a).toLowerCase());
	})
	.build();

// trim(string) -> string
const trim: Operator = defineOperator("string", "trim")
	.setParams(stringType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return stringVal(expectString(a).trim());
	})
	.build();

// split(string, string) -> list(string)
const split: Operator = defineOperator("string", "split")
	.setParams(stringType, stringType)
	.setReturns(listType(stringType))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const parts = expectString(a).split(expectString(b));
		return listVal(parts.map((s) => stringVal(s)));
	})
	.build();

// includes(string, string) -> bool
const includes: Operator = defineOperator("string", "includes")
	.setParams(stringType, stringType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return boolVal(expectString(a).includes(expectString(b)));
	})
	.build();

// replace(string, string, string) -> string
const replace: Operator = defineOperator("string", "replace")
	.setParams(stringType, stringType, stringType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a, b, c) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (isError(c)) return c;
		return stringVal(expectString(a).replace(expectString(b), expectString(c)));
	})
	.build();

// charAt(string, int) -> string
const charAt: Operator = defineOperator("string", "charAt")
	.setParams(stringType, intType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return stringVal(expectString(a).charAt(expectInt(b)));
	})
	.build();

// substring(string, int, int) -> string
const substring: Operator = defineOperator("string", "substring")
	.setParams(stringType, intType, intType)
	.setReturns(stringType)
	.setPure(true)
	.setImpl((a, b, c) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (isError(c)) return c;
		return stringVal(expectString(a).slice(expectInt(b), expectInt(c)));
	})
	.build();

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the string domain registry with all string operators.
 */
export function createStringRegistry(): OperatorRegistry {
	const operators: Operator[] = [
		concat, length, slice, indexOf, toUpper, toLower,
		trim, split, includes, replace, charAt, substring,
	];

	return operators.reduce<OperatorRegistry>(
		(reg, op) => registerOperator(reg, op),
		new Map(),
	);
}
