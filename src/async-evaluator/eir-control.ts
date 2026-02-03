// EIR Control Flow and Effect Handlers

import {
	type ValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type Value,
	voidVal,
	errorVal,
	isError,
	isBlockNode,
	isExprNode,
	isRefNode,
	refCellVal,
} from "../types.js";
import { lookupEffect } from "../effects.js";
import { evalAsyncEffect, type AsyncEffectContext } from "../async-io-effects.js";
import type { AsyncEvalContext } from "./types.js";
import type { Expr } from "../types.js";

//==============================================================================
// While
//==============================================================================

export async function evalWhile(
	expr: { kind: "while"; cond: string | Expr; body: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const maxIter = 10_000;
	for (let i = 0; i < maxIter; i++) {
		const condValue = await ctx.svc.resolveNodeRef(expr.cond, env, ctx);
		if (condValue.kind !== "bool") {
			return errorVal(ErrorCodes.TypeError, "while condition must be boolean");
		}
		if (!condValue.value) break;
		await ctx.svc.resolveNodeRef(expr.body, env, ctx);
	}
	return voidVal();
}

//==============================================================================
// For
//==============================================================================

export async function evalFor(
	expr: { kind: "for"; var: string; init: string | Expr; cond: string | Expr; update: string | Expr; body: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	await ctx.svc.resolveNodeRef(expr.init, env, ctx);
	const maxIter = 10_000;
	for (let i = 0; i < maxIter; i++) {
		const condValue = await ctx.svc.resolveNodeRef(expr.cond, env, ctx);
		if (condValue.kind !== "bool" || !condValue.value) break;
		await ctx.svc.resolveNodeRef(expr.body, env, ctx);
		await ctx.svc.resolveNodeRef(expr.update, env, ctx);
	}
	return voidVal();
}

//==============================================================================
// Iter
//==============================================================================

export async function evalIter(
	expr: { kind: "iter"; var: string; iter: string | Expr; body: string | Expr },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const iterValue = await ctx.svc.resolveNodeRef(expr.iter, env, ctx);

	if (iterValue.kind !== "list") {
		return errorVal(ErrorCodes.TypeError, "iter requires a list");
	}

	for (const item of iterValue.value) {
		const newEnv = extendValueEnv(env, expr.var, item);
		await ctx.svc.resolveNodeRef(expr.body, newEnv, ctx);
	}

	return voidVal();
}

//==============================================================================
// Effect
//==============================================================================

function tryAsyncEffect(
	op: string,
	ctx: AsyncEvalContext,
	argValues: Value[],
): Value | null {
	if (!ctx.svc.asyncIOConfig) return null;
	const effectCtx: AsyncEffectContext = {
		effectName: op,
		state: ctx.state,
		config: ctx.svc.asyncIOConfig,
	};
	return evalAsyncEffect(effectCtx, argValues);
}

async function resolveEffectArgs(
	args: (string | Expr)[],
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value[]> {
	const argValues: Value[] = [];
	for (const arg of args) {
		argValues.push(await ctx.svc.resolveNodeRef(arg, env, ctx));
	}
	return argValues;
}

interface EffectExecInput {
	effect: { fn: (...args: Value[]) => Value };
	op: string;
	argValues: Value[];
}

function executeEffect(input: EffectExecInput, ctx: AsyncEvalContext): Value {
	const { effect, op, argValues } = input;
	try {
		const result = effect.fn(...argValues);
		if (isError(result) && result.message?.includes("evalAsyncEffect")) {
			return tryAsyncEffect(op, ctx, argValues) ?? result;
		}
		return result;
	} catch (e) {
		return errorVal(ErrorCodes.DomainError, String(e));
	}
}

export async function evalEffect(
	expr: { kind: "effect"; op: string; args: (string | Expr)[] },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const argValues = await resolveEffectArgs(expr.args, env, ctx);
	const effect = lookupEffect(ctx.svc.effectRegistry, expr.op);

	if (!effect) {
		return tryAsyncEffect(expr.op, ctx, argValues)
			?? errorVal(ErrorCodes.UnknownOperator, `Unknown effect: ${expr.op}`);
	}

	return executeEffect({ effect, op: expr.op, argValues }, ctx);
}

//==============================================================================
// RefCell
//==============================================================================

export function evalRefCellExpr(
	expr: { kind: "refCell"; target: string },
	ctx: AsyncEvalContext,
): Value {
	return ctx.state.refCells.get(expr.target) ?? refCellVal(voidVal());
}

//==============================================================================
// Ref
//==============================================================================

export function evalRefExpr(
	expr: { kind: "ref"; id: string },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Value {
	const nodeValue = ctx.nodeValues.get(expr.id);
	if (nodeValue !== undefined) return nodeValue;

	const envValue = lookupValue(env, expr.id);
	if (envValue !== undefined) return envValue;

	const cell = ctx.state.refCells.get(expr.id);
	if (cell?.kind === "refCell") return cell.value;

	return errorVal(ErrorCodes.DomainError, "Reference not found: " + expr.id);
}

//==============================================================================
// Try - helper functions
//==============================================================================

interface TryBodyInput {
	bodyId: string;
	bodyNode: import("../types.js").EirHybridNode;
}

async function evalAndCacheBody(
	input: TryBodyInput,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	if (isBlockNode(input.bodyNode)) {
		const result = await ctx.svc.evalBlockNode(input.bodyNode, ctx);
		ctx.nodeValues.set(input.bodyId, result.value);
		return result.value;
	}
	if (isRefNode(input.bodyNode)) {
		return errorVal(ErrorCodes.DomainError, `RefNode not supported in async evaluator: ${input.bodyNode.$ref}`);
	}
	if (!isExprNode(input.bodyNode)) {
		return errorVal(ErrorCodes.DomainError, `Invalid node type for try body: ${input.bodyId}`);
	}
	const value = await ctx.svc.evalExpr(input.bodyNode.expr, env, ctx);
	ctx.nodeValues.set(input.bodyId, value);
	return value;
}

async function evalTryBodyRef(
	bodyId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const cached = ctx.nodeValues.get(bodyId);
	if (cached !== undefined) return cached;

	const bodyNode = ctx.nodeMap.get(bodyId);
	if (!bodyNode) {
		return errorVal(ErrorCodes.ValidationError, "Try body node not found: " + bodyId);
	}

	return evalAndCacheBody({ bodyId, bodyNode }, env, ctx);
}

async function evalNodeOrExpr(
	ref: string | Expr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	if (typeof ref !== "string") {
		return ctx.svc.evalExpr(ref, env, ctx);
	}

	const node = ctx.nodeMap.get(ref);
	if (!node) {
		return errorVal(ErrorCodes.ValidationError, "Node not found: " + ref);
	}

	if (isBlockNode(node)) {
		return (await ctx.svc.evalBlockNode(node, ctx)).value;
	}
	if (isRefNode(node)) {
		return errorVal(ErrorCodes.DomainError, `RefNode not supported in async evaluator: ${node.$ref}`);
	}
	if (!isExprNode(node)) {
		return errorVal(ErrorCodes.DomainError, `Invalid node type for ref: ${ref}`);
	}

	return ctx.svc.evalExpr(node.expr, env, ctx);
}

//==============================================================================
// Try
//==============================================================================

export async function evalTryExpr(
	expr: { kind: "try"; tryBody: string | Expr; catchParam: string; catchBody: string | Expr; fallback?: string | Expr | undefined },
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const tryValue = typeof expr.tryBody === "string"
		? await evalTryBodyRef(expr.tryBody, env, ctx)
		: await ctx.svc.evalExpr(expr.tryBody, env, ctx);

	if (isError(tryValue)) {
		const catchEnv = extendValueEnv(env, expr.catchParam, tryValue);
		const catchCtx: AsyncEvalContext = {
			...ctx,
			state: { ...ctx.state, env: catchEnv },
		};
		return evalNodeOrExpr(expr.catchBody, catchEnv, catchCtx);
	}

	if (expr.fallback) {
		return evalNodeOrExpr(expr.fallback, env, ctx);
	}

	return tryValue;
}
