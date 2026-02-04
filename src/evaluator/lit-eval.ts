// Literal value evaluation

import { ErrorCodes } from "../errors.ts";
import { type Type, type Value, voidVal } from "../types.ts";
import {
	boolVal,
	errorVal,
	floatVal,
	hashValue,
	intVal,
	listVal,
	mapVal,
	opaqueVal,
	optionVal,
	setVal,
	stringVal,
} from "../types.ts";

//==============================================================================
// Type Helpers
//==============================================================================

function isValue(v: unknown): v is Value {
	return typeof v === "object" && v !== null && "kind" in v;
}

//==============================================================================
// Full literal evaluation (used by Evaluator class and evalExprWithNodeMap)
//==============================================================================

export function evalLitValue(
	expr: { type: Type; value: unknown },
): Value {
	const result = evalLitPrimitive(expr.type, expr.value);
	if (result !== undefined) return result;
	return evalLitCompound(expr.type, expr.value);
}

function evalLitPrimitive(t: Type, v: unknown): Value | undefined {
	switch (t.kind) {
	case "void":
		return voidVal();
	case "bool":
		return boolVal(Boolean(v));
	case "int":
		return intVal(Number(v));
	case "float":
		return floatVal(Number(v));
	case "string":
		return stringVal(String(v));
	default:
		return undefined;
	}
}

function evalLitCompound(t: Type, v: unknown): Value {
	switch (t.kind) {
	case "list":
		return evalLitList(t.of, v);
	case "set":
		return evalLitSet(t.of, v);
	case "map":
		return evalLitMap(v);
	case "option":
		return evalLitOption(v);
	case "opaque":
		return opaqueVal(t.name, v);
	default:
		return errorVal(
			ErrorCodes.TypeError,
			"Cannot create literal for type: " + t.kind,
		);
	}
}

function evalLitList(elementType: Type, v: unknown): Value {
	if (!Array.isArray(v)) {
		return errorVal(ErrorCodes.TypeError, "List value must be array");
	}
	const listElements = v.map((elem: unknown) =>
		convertListElement(elem, elementType),
	);
	return listVal(listElements);
}

function convertListElement(elem: unknown, elementType: Type): Value {
	if (typeof elem === "object" && elem !== null && "kind" in elem) {
		return convertValueObject(elem);
	}
	return convertRawPrimitive(elem, elementType);
}

function convertValueObject(valObj: object & { kind: unknown }): Value {
	if (!("value" in valObj)) {
		return errorVal(
			ErrorCodes.TypeError,
			"Unsupported value kind in list element: " + String(valObj.kind),
		);
	}
	// After the "value" in check, TS knows valObj has both kind and value
	return convertTypedValue(valObj.kind, valObj.value);
}

function convertTypedValue(kind: unknown, value: unknown): Value {
	if (kind === "int") return intVal(Number(value));
	if (kind === "bool") return boolVal(Boolean(value));
	if (kind === "string") return stringVal(String(value));
	if (kind === "float") return floatVal(Number(value));
	return errorVal(
		ErrorCodes.TypeError,
		"Unsupported value kind in list element: " + String(kind),
	);
}

function convertRawPrimitive(elem: unknown, elementType: Type): Value {
	if (elementType.kind === "int") return intVal(Number(elem));
	if (elementType.kind === "bool") return boolVal(Boolean(elem));
	if (elementType.kind === "string") return stringVal(String(elem));
	if (elementType.kind === "float") return floatVal(Number(elem));
	return intVal(Number(elem));
}

function evalLitSet(elementType: Type, v: unknown): Value {
	if (!Array.isArray(v)) {
		return errorVal(ErrorCodes.TypeError, "Set value must be array");
	}
	const elements = v.map((elem: unknown) =>
		convertListElement(elem, elementType),
	);
	return setVal(new Set(elements.map(hashValue)));
}

function evalLitMap(v: unknown): Value {
	if (!Array.isArray(v)) {
		return errorVal(ErrorCodes.TypeError, "Map value must be array");
	}
	return mapVal(
		new Map(v.map(([k, val]: [Value, Value]) => [hashValue(k), val])),
	);
}

function evalLitOption(v: unknown): Value {
	if (v === null) return optionVal(null);
	if (isValue(v)) return optionVal(v);
	return errorVal(ErrorCodes.TypeError, "Option value must be a Value or null");
}
