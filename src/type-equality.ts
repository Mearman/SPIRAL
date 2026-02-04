// SPIRAL Type Equality
// Extracted from types.ts to reduce file complexity

import type { Type } from "./zod-schemas.ts";

function paramsEqual(aParams: Type[], bParams: Type[]): boolean {
	if (aParams.length !== bParams.length) return false;
	for (let i = 0; i < aParams.length; i++) {
		const paramA = aParams[i];
		const paramB = bParams[i];
		if (paramA === undefined || paramB === undefined) return false;
		if (!typeEqual(paramA, paramB)) return false;
	}
	return true;
}

function getOfField(t: Type): Type | undefined {
	if ("of" in t) return t.of;
	return undefined;
}

function wrapperEqual(a: Type, b: Type): boolean {
	const aOf = getOfField(a);
	const bOf = getOfField(b);
	if (aOf === undefined || bOf === undefined) return false;
	return typeEqual(aOf, bOf);
}

function mapEqual(a: Type, b: Type): boolean {
	if (a.kind !== "map" || b.kind !== "map") return false;
	return typeEqual(a.key, b.key) && typeEqual(a.value, b.value);
}

function opaqueEqual(a: Type, b: Type): boolean {
	if (a.kind !== "opaque" || b.kind !== "opaque") return false;
	return a.name === b.name;
}

function fnEqual(a: Type, b: Type): boolean {
	if (a.kind !== "fn" || b.kind !== "fn") return false;
	return paramsEqual(a.params, b.params) && typeEqual(a.returns, b.returns);
}

function taskEqual(a: Type, b: Type): boolean {
	if (a.kind !== "task" || b.kind !== "task") return false;
	return typeEqual(a.returns, b.returns);
}

function asyncEqual(a: Type, b: Type): boolean {
	if (a.kind !== "async" || b.kind !== "async") return false;
	return paramsEqual(a.params, b.params) && typeEqual(a.returns, b.returns);
}

const PRIMITIVE_KINDS: ReadonlySet<string> = new Set([
	"bool", "int", "float", "string", "void",
]);

const WRAPPER_KINDS: ReadonlySet<string> = new Set([
	"set", "list", "option", "ref", "future", "channel",
]);

const COMPOUND_CHECKERS: Record<string, (a: Type, b: Type) => boolean> = {
	map: mapEqual,
	opaque: opaqueEqual,
	fn: fnEqual,
	task: taskEqual,
	async: asyncEqual,
};

export function typeEqual(a: Type, b: Type): boolean {
	if (a.kind !== b.kind) return false;
	if (PRIMITIVE_KINDS.has(a.kind)) return true;
	if (WRAPPER_KINDS.has(a.kind)) return wrapperEqual(a, b);
	const checker = COMPOUND_CHECKERS[a.kind];
	if (checker) return checker(a, b);
	return false;
}
