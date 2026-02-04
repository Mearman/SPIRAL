// EIR loop evaluation: while, for, iter

import { type ValueEnv, extendValueEnv } from "../env.ts";
import { ErrorCodes } from "../errors.ts";
import {
	type EirExpr,
	type Expr,
	type Value,
	voidVal,
	intVal,
} from "../types.ts";
import { boolVal, errorVal, floatVal, isError, stringVal } from "../types.ts";
import type { EIRNodeEvalResult, EirEvalCtx } from "./types.ts";
import { evalEIRNode, eirResult } from "./eir-eval.ts";
import { evalExprInline } from "./air-expr.ts";

//==============================================================================
// While loop
//==============================================================================

export function evalEirWhile(ctx: EirEvalCtx, expr: EirExpr & { kind: "while" }): EIRNodeEvalResult {
	let loopResult: Value = voidVal();
	for (;;) {
		const stepErr = checkWhileStep(ctx);
		if (stepErr) return stepErr;
		const iterResult = runWhileIteration(ctx, expr);
		if (iterResult === undefined) break;
		if (isError(iterResult.value)) return iterResult;
		loopResult = iterResult.value;
	}
	return { value: loopResult, env: ctx.state.env, refCells: ctx.state.refCells };
}

function runWhileIteration(ctx: EirEvalCtx, expr: EirExpr & { kind: "while" }): EIRNodeEvalResult | undefined {
	const condValue = evalCondOrBody(ctx, expr.cond);
	if (isError(condValue)) return eirResult(condValue, ctx);
	if (condValue.kind !== "bool" || !condValue.value) return undefined;
	return evalLoopBody(ctx, expr.body);
}

function checkWhileStep(ctx: EirEvalCtx): EIRNodeEvalResult | undefined {
	ctx.state.steps++;
	if (ctx.state.steps > ctx.state.maxSteps) {
		return eirResult(errorVal(ErrorCodes.NonTermination, "While loop exceeded maximum steps"), ctx);
	}
	return undefined;
}

function evalCondOrBody(ctx: EirEvalCtx, part: string | Expr): Value {
	if (typeof part === "string") {
		const node = ctx.nodeMap.get(part);
		if (!node) return errorVal(ErrorCodes.DomainError, "Node not found: " + part);
		ctx.nodeValues.delete(part);
		return evalEIRNode(ctx, node).value;
	}
	return evalExprInline(ctx, part, ctx.state.env);
}

function evalLoopBody(ctx: EirEvalCtx, body: string | Expr): EIRNodeEvalResult {
	if (typeof body === "string") {
		const node = ctx.nodeMap.get(body);
		if (!node) return eirResult(errorVal(ErrorCodes.DomainError, "Body node not found: " + body), ctx);
		const result = evalEIRNode(ctx, node);
		if (result.refCells) ctx.state.refCells = result.refCells;
		if (result.env !== ctx.state.env) ctx.state.env = result.env;
		return result;
	}
	const val = evalExprInline(ctx, body, ctx.state.env);
	return { value: val, env: ctx.state.env, refCells: ctx.state.refCells };
}

//==============================================================================
// For loop
//==============================================================================

export function evalEirFor(ctx: EirEvalCtx, expr: EirExpr & { kind: "for" }): EIRNodeEvalResult {
	const initValue = evalCondOrBody(ctx, expr.init);
	if (isError(initValue)) return eirResult(initValue, ctx);
	return runForLoop(ctx, expr, initValue);
}

interface ForState {
	loopEnv: ValueEnv;
	loopResult: Value;
}

function runForLoop(ctx: EirEvalCtx, expr: EirExpr & { kind: "for" }, initValue: Value): EIRNodeEvalResult {
	const fs: ForState = {
		loopEnv: extendValueEnv(ctx.state.env, expr.var, initValue),
		loopResult: voidVal(),
	};
	let result: EIRNodeEvalResult | undefined;
	while (result === undefined) {
		const stepErr = checkForStep(ctx);
		if (stepErr) return stepErr;
		result = runForIteration(ctx, expr, fs);
	}
	return result;
}

function checkForStep(ctx: EirEvalCtx): EIRNodeEvalResult | undefined {
	ctx.state.steps++;
	if (ctx.state.steps > ctx.state.maxSteps) {
		return eirResult(errorVal(ErrorCodes.NonTermination, "For loop exceeded maximum steps"), ctx);
	}
	return undefined;
}

function runForIteration(ctx: EirEvalCtx, expr: EirExpr & { kind: "for" }, fs: ForState): EIRNodeEvalResult | undefined {
	const condVal = evalWithTempEnv(ctx, expr.cond, fs.loopEnv);
	if (isError(condVal)) return { value: condVal, env: fs.loopEnv, refCells: ctx.state.refCells };
	if (condVal.kind !== "bool" || !condVal.value) {
		return { value: fs.loopResult, env: fs.loopEnv, refCells: ctx.state.refCells };
	}
	return advanceForLoop(ctx, expr, fs);
}

function advanceForLoop(ctx: EirEvalCtx, expr: EirExpr & { kind: "for" }, fs: ForState): EIRNodeEvalResult | undefined {
	const bodyVal = evalWithTempEnv(ctx, expr.body, fs.loopEnv);
	if (isError(bodyVal)) return { value: bodyVal, env: fs.loopEnv, refCells: ctx.state.refCells };
	fs.loopResult = bodyVal;
	const updateVal = evalWithTempEnv(ctx, expr.update, fs.loopEnv);
	if (isError(updateVal)) return { value: updateVal, env: fs.loopEnv, refCells: ctx.state.refCells };
	fs.loopEnv = extendValueEnv(fs.loopEnv, expr.var, updateVal);
	return undefined;
}

function evalWithTempEnv(ctx: EirEvalCtx, part: string | Expr, tempEnv: ValueEnv): Value {
	if (typeof part !== "string") {
		return evalExprInline(ctx, part, tempEnv);
	}
	const node = ctx.nodeMap.get(part);
	if (!node) return errorVal(ErrorCodes.DomainError, "Node not found: " + part);
	const originalEnv = ctx.state.env;
	ctx.state.env = tempEnv;
	const result = evalEIRNode(ctx, node);
	ctx.state.env = originalEnv;
	if (result.refCells) ctx.state.refCells = result.refCells;
	return result.value;
}

//==============================================================================
// Iter loop
//==============================================================================

export function evalEirIter(ctx: EirEvalCtx, expr: EirExpr & { kind: "iter" }): EIRNodeEvalResult {
	const iterValue = evalCondOrBody(ctx, expr.iter);
	if (isError(iterValue)) return eirResult(iterValue, ctx);
	const elements = extractElements(iterValue);
	if (!Array.isArray(elements)) return eirResult(elements, ctx);
	return runIterLoop(ctx, expr, elements);
}

function extractElements(iterValue: Value): Value[] | Value {
	if (iterValue.kind === "list") return iterValue.value;
	if (iterValue.kind === "set") return convertSetToArray(iterValue.value);
	return errorVal(ErrorCodes.TypeError, "Iter requires list or set, got: " + iterValue.kind);
}

function convertSetToArray(set: Set<string>): Value[] {
	return Array.from(set).map(convertHashToValue);
}

function convertHashToValue(hash: string): Value {
	const colonIndex = hash.indexOf(":");
	if (colonIndex === -1) return errorVal(ErrorCodes.TypeError, "Invalid hash format: " + hash);
	const typePrefix = hash.slice(0, colonIndex);
	const valueStr = hash.slice(colonIndex + 1);
	return convertHashParts(typePrefix, valueStr);
}

function convertHashParts(typePrefix: string, valueStr: string): Value {
	switch (typePrefix) {
	case "i":
		return intVal(Number.parseInt(valueStr, 10));
	case "b":
		return boolVal(valueStr === "true");
	case "f":
		return floatVal(Number.parseFloat(valueStr));
	case "s":
		return stringVal(valueStr);
	default:
		return errorVal(ErrorCodes.TypeError, "Unknown hash type: " + typePrefix);
	}
}

interface IterState {
	iterEnv: ValueEnv;
}

function runIterLoop(
	ctx: EirEvalCtx,
	expr: EirExpr & { kind: "iter" },
	elements: Value[],
): EIRNodeEvalResult {
	const is: IterState = { iterEnv: ctx.state.env };
	for (const elem of elements) {
		const stepErr = checkIterStep(ctx);
		if (stepErr) return stepErr;
		const loopEnv = extendValueEnv(is.iterEnv, expr.var, elem);
		const result = evalIterBody(ctx, expr.body, loopEnv);
		if (isError(result.value)) return { value: result.value, env: is.iterEnv, refCells: ctx.state.refCells };
		is.iterEnv = result.env;
		if (result.refCells) ctx.state.refCells = result.refCells;
	}
	return { value: voidVal(), env: is.iterEnv, refCells: ctx.state.refCells };
}

function checkIterStep(ctx: EirEvalCtx): EIRNodeEvalResult | undefined {
	ctx.state.steps++;
	if (ctx.state.steps > ctx.state.maxSteps) {
		return eirResult(errorVal(ErrorCodes.NonTermination, "Iter loop exceeded maximum steps"), ctx);
	}
	return undefined;
}

function evalIterBody(ctx: EirEvalCtx, body: string | Expr, loopEnv: ValueEnv): EIRNodeEvalResult {
	if (typeof body !== "string") {
		const val = evalExprInline(ctx, body, loopEnv);
		return { value: val, env: loopEnv };
	}
	const node = ctx.nodeMap.get(body);
	if (!node) return eirResult(errorVal(ErrorCodes.DomainError, "Body node not found: " + body), ctx);
	const originalEnv = ctx.state.env;
	ctx.state.env = loopEnv;
	const result = evalEIRNode(ctx, node);
	ctx.state.env = originalEnv;
	return result;
}
