// SPIRAL Kernel — Irreducible native operators
// These cannot be implemented in SPIRAL without infinite regress.
// Everything else is derived in stdlib CIR programs.

import { SPIRALError, ErrorCodes } from "../errors.js";
import type { Value } from "../types.js";
import {
	boolType,
	boolVal,
	errorVal,
	floatType,
	floatVal,
	hashValue,
	intType,
	intVal,
	isError,
	listType,
	listVal,
	mapType,
	mapVal,
	opaqueType,
	setType,
	setVal,
	stringType,
	stringVal,
} from "../types.js";
import {
	defineOperator,
	type Operator,
	type OperatorRegistry,
	registerOperator,
} from "../domains/registry.js";

// Helpers

function expectInt(v: Value): number {
	if (v.kind === "int") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(intType, opaqueType(v.kind));
}

function getNumeric(v: Value): number {
	if (v.kind === "int") return v.value;
	if (v.kind === "float") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(floatType, opaqueType(v.kind));
}

function expectString(v: Value): string {
	if (v.kind === "string") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(stringType, opaqueType(v.kind));
}

function expectBool(v: Value): boolean {
	if (v.kind === "bool") return v.value;
	if (v.kind === "error") throw SPIRALError.domainError(v.message ?? v.code);
	throw SPIRALError.typeError(boolType, opaqueType(v.kind));
}

// core — Arithmetic (7)
const add: Operator = defineOperator("core", "add")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return intVal(a.value + b.value);
		return floatVal(getNumeric(a) + getNumeric(b));
	}).build();

const sub: Operator = defineOperator("core", "sub")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return intVal(a.value - b.value);
		return floatVal(getNumeric(a) - getNumeric(b));
	}).build();

const mul: Operator = defineOperator("core", "mul")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return intVal(a.value * b.value);
		return floatVal(getNumeric(a) * getNumeric(b));
	}).build();

const div: Operator = defineOperator("core", "div")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const bv = getNumeric(b);
		if (bv === 0) return errorVal(ErrorCodes.DivideByZero, "Division by zero");
		if (a.kind === "int" && b.kind === "int") return intVal(Math.trunc(a.value / bv));
		return floatVal(getNumeric(a) / bv);
	}).build();

const mod: Operator = defineOperator("core", "mod")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		const bv = expectInt(b);
		if (bv === 0) return errorVal(ErrorCodes.DivideByZero, "Modulo by zero");
		return intVal(expectInt(a) % bv);
	}).build();

const pow: Operator = defineOperator("core", "pow")
	.setParams(intType, intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return intVal(Math.pow(a.value, b.value));
		return floatVal(Math.pow(getNumeric(a), getNumeric(b)));
	}).build();

const neg: Operator = defineOperator("core", "neg")
	.setParams(intType).setReturns(intType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind === "int") return intVal(-a.value);
		if (a.kind === "float") return floatVal(-a.value);
		return errorVal(ErrorCodes.TypeError, "Expected numeric value");
	}).build();

// core — Comparison (6)
const eq: Operator = defineOperator("core", "eq")
	.setParams(intType, intType).setReturns(boolType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return boolVal(a.value === b.value);
		if (a.kind === "float" && b.kind === "float") return boolVal(a.value === b.value);
		if (a.kind === "string" && b.kind === "string") return boolVal(a.value === b.value);
		return boolVal(getNumeric(a) === getNumeric(b));
	}).build();

const neq: Operator = defineOperator("core", "neq")
	.setParams(intType, intType).setReturns(boolType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind === "int" && b.kind === "int") return boolVal(a.value !== b.value);
		if (a.kind === "float" && b.kind === "float") return boolVal(a.value !== b.value);
		if (a.kind === "string" && b.kind === "string") return boolVal(a.value !== b.value);
		return boolVal(getNumeric(a) !== getNumeric(b));
	}).build();

function numericCmp(ns: string, name: string, cmp: (a: number, b: number) => boolean): Operator {
	return defineOperator(ns, name).setParams(intType, intType).setReturns(boolType).setPure(true)
		.setImpl((a, b) => {
			if (isError(a)) return a;
			if (isError(b)) return b;
			return boolVal(cmp(getNumeric(a), getNumeric(b)));
		}).build();
}

const lt = numericCmp("core", "lt", (a, b) => a < b);
const lte = numericCmp("core", "lte", (a, b) => a <= b);
const gt = numericCmp("core", "gt", (a, b) => a > b);
const gte = numericCmp("core", "gte", (a, b) => a >= b);

// core — Introspection (1)
const typeofOp: Operator = defineOperator("core", "typeof")
	.setParams(intType).setReturns(stringType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return stringVal(a.kind);
	}).build();

// bool — not (1)
const boolNot: Operator = defineOperator("bool", "not")
	.setParams(boolType).setReturns(boolType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return boolVal(!expectBool(a));
	}).build();

// list — Primitives (3)

const listLength: Operator = defineOperator("list", "length")
	.setParams(listType(intType)).setReturns(intType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind !== "list") return errorVal(ErrorCodes.TypeError, "Expected list value");
		return intVal(a.value.length);
	}).build();

const listNth: Operator = defineOperator("list", "nth")
	.setParams(listType(intType), intType).setReturns(intType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "list") return errorVal(ErrorCodes.TypeError, "Expected list value");
		if (b.kind !== "int") return errorVal(ErrorCodes.TypeError, "Expected int index");
		const idx = b.value;
		if (idx < 0 || idx >= a.value.length) return errorVal(ErrorCodes.DomainError, "Index out of bounds: " + String(idx));
		const result = a.value[idx];
		if (result === undefined) return errorVal(ErrorCodes.DomainError, "Index out of bounds: " + String(idx));
		return result;
	}).build();

const listCons: Operator = defineOperator("list", "cons")
	.setParams(intType, listType(intType)).setReturns(listType(intType)).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (b.kind !== "list") return errorVal(ErrorCodes.TypeError, "Expected list value for second argument");
		return listVal([a, ...b.value]);
	}).build();

// map — Primitives (4)

const mapGet: Operator = defineOperator("map", "get")
	.setParams(mapType(stringType, intType), stringType).setReturns(intType).setPure(true)
	.setImpl((m, k) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		const result = m.value.get(hash);
		if (result === undefined) return errorVal(ErrorCodes.DomainError, "Key not found: " + k.value);
		return result;
	}).build();

const mapSet: Operator = defineOperator("map", "set")
	.setParams(mapType(stringType, intType), stringType, intType).setReturns(mapType(stringType, intType)).setPure(true)
	.setImpl((m, k, v) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (isError(v)) return v;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		const newMap = new Map(m.value);
		newMap.set(hash, v);
		return mapVal(newMap);
	}).build();

const mapHas: Operator = defineOperator("map", "has")
	.setParams(mapType(stringType, intType), stringType).setReturns(boolType).setPure(true)
	.setImpl((m, k) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		return boolVal(m.value.has(hash));
	}).build();

const mapKeys: Operator = defineOperator("map", "keys")
	.setParams(mapType(stringType, intType)).setReturns(listType(stringType)).setPure(true)
	.setImpl((m) => {
		if (isError(m)) return m;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		const keyList: Value[] = [];
		for (const hash of m.value.keys()) {
			if (hash.startsWith("s:")) {
				keyList.push(stringVal(hash.slice(2)));
			}
		}
		return listVal(keyList);
	}).build();

// string — Primitives (6): concat, length, charAt + Unicode host ops

const strConcat: Operator = defineOperator("string", "concat")
	.setParams(stringType, stringType).setReturns(stringType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return stringVal(expectString(a) + expectString(b));
	}).build();

const strLength: Operator = defineOperator("string", "length")
	.setParams(stringType).setReturns(intType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		return intVal(expectString(a).length);
	}).build();

const strCharAt: Operator = defineOperator("string", "charAt")
	.setParams(stringType, intType).setReturns(stringType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		return stringVal(expectString(a).charAt(expectInt(b)));
	}).build();

function unaryStr(name: string, fn: (s: string) => string): Operator {
	return defineOperator("string", name).setParams(stringType).setReturns(stringType).setPure(true)
		.setImpl((a) => { if (isError(a)) return a; return stringVal(fn(expectString(a))); }).build();
}
const strToUpper = unaryStr("toUpper", s => s.toUpperCase());
const strToLower = unaryStr("toLower", s => s.toLowerCase());
const strTrim = unaryStr("trim", s => s.trim());

// set — Primitives (4): require hash-based lookup

const setAdd: Operator = defineOperator("set", "add")
	.setParams(setType(intType), intType).setReturns(setType(intType)).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") return errorVal(ErrorCodes.TypeError, "Expected set value");
		return setVal(new Set([...a.value, hashValue(b)]));
	}).build();

const setRemove: Operator = defineOperator("set", "remove")
	.setParams(setType(intType), intType).setReturns(setType(intType)).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") return errorVal(ErrorCodes.TypeError, "Expected set value");
		const result = new Set(a.value);
		result.delete(hashValue(b));
		return setVal(result);
	}).build();

const setContains: Operator = defineOperator("set", "contains")
	.setParams(setType(intType), intType).setReturns(boolType).setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "set") return errorVal(ErrorCodes.TypeError, "Expected set value");
		return boolVal(a.value.has(hashValue(b)));
	}).build();

const setSize: Operator = defineOperator("set", "size")
	.setParams(setType(intType)).setReturns(intType).setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind !== "set") return errorVal(ErrorCodes.TypeError, "Expected set value");
		return intVal(a.value.size);
	}).build();

// Kernel Registry — 32 native operators

export function createKernelRegistry(): OperatorRegistry {
	const operators: Operator[] = [
		// core: arithmetic (7)
		add, sub, mul, div, mod, pow, neg,
		// core: comparison (6)
		eq, neq, lt, lte, gt, gte,
		// core: introspection (1)
		typeofOp,
		// bool: not (1)
		boolNot,
		// list: primitives (3)
		listLength, listNth, listCons,
		// map: primitives (4)
		mapGet, mapSet, mapHas, mapKeys,
		// string: primitives (6)
		strConcat, strLength, strCharAt, strToUpper, strToLower, strTrim,
		// set: primitives (4)
		setAdd, setRemove, setContains, setSize,
	];

	return operators.reduce<OperatorRegistry>(
		(reg, op) => registerOperator(reg, op),
		new Map(),
	);
}
