// Node Reference Resolution helpers

import {
	type ValueEnv,
	lookupValue,
} from "../env.js";
import { ErrorCodes } from "../errors.js";
import {
	type Value,
	isBlockNode,
	errorVal,
	isError,
} from "../types.js";
import type { EirExpr } from "../types.js";
import type { AsyncEvalContext } from "./types.js";

//==============================================================================
// resolveNodeRef
//==============================================================================

export async function resolveNodeRef(
	ref: string | EirExpr,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	if (typeof ref !== "string") {
		return ctx.svc.evalExpr(ref, env, ctx);
	}
	return resolveStringRef(ref, env, ctx);
}

//==============================================================================
// String reference resolution
//==============================================================================

async function resolveStringRef(
	nodeId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const fromEnv = lookupInSources(nodeId, env, ctx);
	if (fromEnv) return fromEnv;

	return evalAndCacheNode(nodeId, env, ctx);
}

function lookupInSources(
	nodeId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Value | null {
	const envVal = lookupValue(env, nodeId);
	if (envVal) return envVal;

	const cell = ctx.state.refCells.get(nodeId);
	if (cell?.kind === "refCell") return cell.value;

	const nodeValue = ctx.nodeValues.get(nodeId);
	if (nodeValue && !isError(nodeValue)) return nodeValue;

	return null;
}

async function evalAndCacheNode(
	nodeId: string,
	env: ValueEnv,
	ctx: AsyncEvalContext,
): Promise<Value> {
	const node = ctx.nodeMap.get(nodeId);
	if (!node) {
		return errorVal(ErrorCodes.UnboundIdentifier, `Node not found: ${nodeId}`);
	}

	if (isBlockNode(node)) {
		const result = await ctx.svc.evalBlockNode(node, ctx);
		ctx.nodeValues.set(nodeId, result.value);
		return result.value;
	}

	const value = await ctx.svc.evalExpr(node.expr, env, ctx);
	ctx.nodeValues.set(nodeId, value);
	return value;
}
