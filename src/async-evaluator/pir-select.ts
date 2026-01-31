// PIR Select and Race Handlers

import { ErrorCodes } from "../errors.js";
import {
	type Value,
	isFuture,
	errorVal,
	isBlockNode,
} from "../types.js";
import type { PirSelectExpr, PirRaceExpr } from "../types.js";
import type { ValueEnv } from "../env.js";
import type { AsyncEvalContext } from "./types.js";

//==============================================================================
// Select
//==============================================================================

interface SelectResult {
	index: number;
	value: Value;
	kind: "future" | "timeout";
}

function buildSelectTimeoutPromise(
	input: { expr: PirSelectExpr; env: ValueEnv; ctx: AsyncEvalContext },
	timeoutMs: number,
): Promise<SelectResult> {
	const { expr, env, ctx } = input;
	return new Promise<SelectResult>((resolve) => {
		setTimeout(() => {
			if (expr.fallback) {
				ctx.svc.resolveNodeRef(expr.fallback, env, ctx)
					.then((v) => { resolve({ index: -1, value: v, kind: "timeout" }); })
					.catch((err: unknown) => {
						const errVal = err instanceof Error
							? errorVal(ErrorCodes.DomainError, err.message)
							: errorVal(ErrorCodes.DomainError, String(err));
						resolve({ index: -1, value: errVal, kind: "timeout" });
					});
			} else {
				resolve({
					index: -1,
					value: errorVal(ErrorCodes.SelectTimeout, "Select timed out"),
					kind: "timeout",
				});
			}
		}, timeoutMs);
	});
}

export async function evalSelectExpr(
	expr: PirSelectExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const futures: Promise<SelectResult>[] = expr.futures.map(
		async (futureId, index) => {
			const fv = await ctx.svc.resolveNodeRef(futureId, env, ctx);
			if (!isFuture(fv)) throw new Error("select requires Future values");
			const value = await ctx.state.scheduler.await(fv.taskId);
			return { index, value, kind: "future" as const };
		},
	);

	if (expr.timeout) {
		const tv = await ctx.svc.resolveNodeRef(expr.timeout, env, ctx);
		if (tv.kind !== "int") {
			return errorVal(ErrorCodes.TypeError, "select timeout must be an integer");
		}
		futures.push(buildSelectTimeoutPromise({ expr, env, ctx }, tv.value));
	}

	const result = await Promise.race(futures);
	if (expr.returnIndex) {
		return { kind: "selectResult", index: result.index, value: result.value };
	}
	return result.value;
}

//==============================================================================
// Race
//==============================================================================

async function evalRaceTask(
	taskId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const node = ctx.nodeMap.get(taskId);
	if (!node) {
		return errorVal(ErrorCodes.UnboundIdentifier, `Race task node not found: ${taskId}`);
	}
	if (isBlockNode(node)) {
		return (await ctx.svc.evalBlockNode(node, ctx)).value;
	}
	return ctx.svc.evalExpr(node.expr, env, ctx);
}

export async function evalRaceExpr(
	expr: PirRaceExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	return Promise.race(expr.tasks.map((id) => evalRaceTask(id, env, ctx)));
}
