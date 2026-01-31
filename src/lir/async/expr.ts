// SPIRAL LIR Async Evaluator - Expression Evaluation

import { ErrorCodes } from "../../errors.js";
import { lookupValue, type ValueEnv } from "../../env.js";
import type { Expr, EirExpr, Value } from "../../types.js";
import { errorVal, intVal, voidVal } from "../../types.js";

/**
 * Evaluate a literal expression to a Value.
 */
function evaluateLitExpr(expr: Expr & { kind: "lit" }): Value {
	const t = expr.type;
	const v = expr.value;
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
		return errorVal(ErrorCodes.TypeError, "Complex literals not yet supported in LIR async");
	}
}

/**
 * Evaluate a simple CIR expression (for LIR assign instruction).
 * Only supports literals and variables for now.
 */
export function evaluateExpr(expr: Expr | EirExpr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "lit":
		return evaluateLitExpr(expr);

	case "var": {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
		}
		return value;
	}

	default:
		return errorVal(ErrorCodes.DomainError, "Complex expressions not yet supported in LIR async");
	}
}
