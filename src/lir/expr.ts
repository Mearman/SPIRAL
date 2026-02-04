// LIR expression evaluation helpers

import { ErrorCodes } from "../errors.ts";
import { lookupValue, type ValueEnv } from "../env.ts";
import type { Expr, Value } from "../types.ts";
import { errorVal, intVal, voidVal } from "../types.ts";
import type { LIRRuntimeState } from "./exec-context.ts";

function evaluateLitExpr(
	t: { kind: string },
	v: unknown,
): Value {
	switch (t.kind) {
	case "bool":
		return { kind: "bool", value: Boolean(v) };
	case "int":
		return intVal(Number(v));
	case "float":
		return { kind: "float", value: Number(v) };
	case "string":
		return { kind: "string", value: String(v) };
	case "void":
		return voidVal();
	default:
		return errorVal(ErrorCodes.TypeError, "Complex literals not yet supported in LIR");
	}
}

export function evaluateExpr(expr: Expr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "lit":
		return evaluateLitExpr(expr.type, expr.value);
	case "var": {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
		}
		return value;
	}
	default:
		return errorVal(ErrorCodes.DomainError, "Complex expressions not yet supported in LIR");
	}
}

export function resolveArgs(
	argIds: string[],
	state: LIRRuntimeState,
): Value[] | Value {
	const values: Value[] = [];
	for (const argId of argIds) {
		const v = lookupValue(state.vars, argId);
		if (!v) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Argument not found: " + argId,
			);
		}
		if (v.kind === "error") {
			return v;
		}
		values.push(v);
	}
	return values;
}
