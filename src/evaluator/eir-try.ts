// EIR try/catch expression evaluation

import { extendValueEnv } from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type EirExpr,
	type EvalState,
	type Expr,
	type Value,
} from "../types.js";
import { errorVal, isError } from "../types.js";
import type { EIRNodeEvalResult, EirEvalCtx } from "./types.js";
import { evalEIRNode } from "./eir-eval.js";
import { evalExprInline } from "./air-expr.js";

//==============================================================================
// Try/Catch expression
//==============================================================================

export function evalEirTry(ctx: EirEvalCtx, expr: EirExpr & { kind: "try" }): EIRNodeEvalResult {
	const tryResult = evalTryBody(ctx, expr.tryBody);
	if (isError(tryResult.value)) {
		return evalCatchPath(ctx, expr, tryResult);
	}
	return evalSuccessPath(ctx, expr, tryResult);
}

interface TryResult {
	value: Value;
	refCells?: Map<string, Value> | undefined;
}

function evalTryBody(ctx: EirEvalCtx, tryBody: string | Expr): TryResult {
	if (typeof tryBody !== "string") {
		return { value: evalExprInline(ctx, tryBody, ctx.state.env) };
	}
	const node = ctx.nodeMap.get(tryBody);
	if (!node) {
		return { value: errorVal(ErrorCodes.ValidationError, "Try body node not found: " + tryBody) };
	}
	const tryValue = ctx.nodeValues.get(tryBody);
	if (tryValue !== undefined) return { value: tryValue };

	const tryNodeResult = evalEIRNode(ctx, node);
	ctx.nodeValues.set(tryBody, tryNodeResult.value);
	return { value: tryNodeResult.value, refCells: tryNodeResult.refCells };
}

function evalCatchPath(
	ctx: EirEvalCtx,
	expr: EirExpr & { kind: "try" },
	tryResult: TryResult,
): EIRNodeEvalResult {
	const catchEnv = extendValueEnv(ctx.state.env, expr.catchParam, tryResult.value);
	const catchState: EvalState = {
		...ctx.state,
		env: catchEnv,
		refCells: tryResult.refCells ?? ctx.state.refCells,
	};
	const catchCtx: EirEvalCtx = { ...ctx, state: catchState };
	const catchValue = evalPartValue(catchCtx, expr.catchBody);
	return { value: catchValue, env: catchState.env, refCells: catchState.refCells };
}

function evalSuccessPath(
	ctx: EirEvalCtx,
	expr: EirExpr & { kind: "try" },
	tryResult: TryResult,
): EIRNodeEvalResult {
	const tryRefCells = tryResult.refCells ?? ctx.state.refCells;

	if (!expr.fallback) {
		return { value: tryResult.value, env: ctx.state.env, refCells: tryRefCells };
	}

	ctx.state.refCells = tryRefCells;
	const fallbackValue = evalPartValue(ctx, expr.fallback);
	return { value: fallbackValue, env: ctx.state.env, refCells: tryRefCells };
}

function evalPartValue(ctx: EirEvalCtx, part: string | Expr): Value {
	if (typeof part !== "string") {
		return evalExprInline(ctx, part, ctx.state.env);
	}
	const node = ctx.nodeMap.get(part);
	if (!node) return errorVal(ErrorCodes.ValidationError, "Node not found: " + part);
	return evalEIRNode(ctx, node).value;
}
