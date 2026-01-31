// AIR type checking helpers - extracted to reduce file size

import { SPIRALError } from "../errors.js";
import { lookupType } from "../env.js";
import type { Expr, Type } from "../types.js";
import {
	boolType,
	fnType as fnTypeCtor,
	intType,
	typeEqual,
} from "../types.js";
import type { AIRCheckContext, TypeCheckResult } from "./context.js";

//==============================================================================
// If expression helpers
//==============================================================================

/** Check condition and validate its type. */
export function checkIfCondition(
	ctx: AIRCheckContext,
	condVal: string | Expr,
): void {
	const condType = resolveIfCond(ctx, condVal);
	const condKey = typeof condVal === "string" ? condVal : "";
	if (ctx.nodeTypes.has(condKey) && condType.kind !== "bool") {
		throw SPIRALError.typeError(boolType, condType, "if condition");
	}
}

function resolveIfCond(ctx: AIRCheckContext, condVal: string | Expr): Type {
	if (typeof condVal === "string") {
		if (!ctx.nodeMap.has(condVal) && !ctx.lambdaParams.has(condVal)) {
			throw SPIRALError.validation("if", "Condition node not found: " + condVal);
		}
		return ctx.nodeTypes.get(condVal) ?? boolType;
	}
	return ctx.checker.typeCheck(condVal, ctx.env).type;
}

export interface IfBranchInput {
	ctx: AIRCheckContext;
	branchVal: string | Expr;
	branchName: string;
	declaredType: Type;
}

export function resolveIfBranch(input: IfBranchInput): Type {
	if (typeof input.branchVal === "string") {
		if (!input.ctx.nodeMap.has(input.branchVal)) {
			throw SPIRALError.validation("if", input.branchName + " branch node not found: " + input.branchVal);
		}
		return input.ctx.nodeTypes.get(input.branchVal) ?? input.declaredType;
	}
	return input.ctx.checker.typeCheck(input.branchVal, input.ctx.env).type;
}

export interface BranchValidation {
	ctx: AIRCheckContext;
	branchVal: string | Expr;
	branchType: Type;
	declaredType: Type;
	label: string;
}

export function validateBranchType(input: BranchValidation): void {
	const key = typeof input.branchVal === "string" ? input.branchVal : "";
	if (input.ctx.nodeTypes.has(key) && !typeEqual(input.branchType, input.declaredType)) {
		throw SPIRALError.typeError(input.declaredType, input.branchType, input.label);
	}
}

//==============================================================================
// CallExpr helpers
//==============================================================================

export function checkCallExprParamOrBound(
	ctx: AIRCheckContext,
	fn: string,
): TypeCheckResult {
	const fnTypeFromEnv = lookupType(ctx.env, fn);
	if (fnTypeFromEnv) {
		if (fnTypeFromEnv.kind !== "fn") {
			throw SPIRALError.typeError(fnTypeCtor([], intType), fnTypeFromEnv, "callExpr function");
		}
		return { type: fnTypeFromEnv.returns, env: ctx.env };
	}
	return { type: intType, env: ctx.env };
}

export function checkCallExprWithFnType(
	ctx: AIRCheckContext,
	expr: { fn: string; args: string[] },
): TypeCheckResult {
	const fnType = ctx.nodeTypes.get(expr.fn);
	if (!fnType) {
		throw SPIRALError.validation("callExpr", "Function node not yet type-checked: " + expr.fn);
	}
	if (fnType.kind !== "fn") {
		throw SPIRALError.typeError(fnTypeCtor([], intType), fnType, "callExpr function");
	}
	if (expr.args.length > fnType.params.length) {
		throw SPIRALError.arityError(fnType.params.length, expr.args.length, "callExpr (too many arguments)");
	}
	verifyCallExprArgTypes(ctx, expr.args, fnType);
	return callExprReturnType(ctx, expr.args, fnType);
}

interface ArgTypeCheck {
	ctx: AIRCheckContext;
	argId: string;
	expected: Type;
	index: number;
}

function checkSingleArgType(input: ArgTypeCheck): void {
	const argType = input.ctx.nodeTypes.get(input.argId);
	if (argType && !typeEqual(argType, input.expected)) {
		throw SPIRALError.typeError(input.expected, argType, "callExpr argument " + input.index);
	}
}

function verifyCallExprArgTypes(
	ctx: AIRCheckContext,
	args: string[],
	fnType: { kind: "fn"; params: Type[]; returns: Type },
): void {
	for (let i = 0; i < args.length; i++) {
		const argId = args[i];
		if (argId === undefined) continue;
		if (ctx.lambdaParams.has(argId)) continue;
		const expected = fnType.params[i];
		if (expected === undefined) continue;
		checkSingleArgType({ ctx, argId, expected, index: i });
	}
}

function callExprReturnType(
	ctx: AIRCheckContext,
	args: string[],
	fnType: { kind: "fn"; params: Type[]; returns: Type },
): TypeCheckResult {
	if (args.length < fnType.params.length) {
		const remaining = fnType.params.slice(args.length);
		return { type: fnTypeCtor(remaining, fnType.returns), env: ctx.env };
	}
	return { type: fnType.returns, env: ctx.env };
}

//==============================================================================
// Fix helpers
//==============================================================================

export function validateFixFnType(fnType: Type): asserts fnType is { kind: "fn"; params: Type[]; returns: Type } {
	if (fnType.kind !== "fn") {
		throw SPIRALError.typeError(fnTypeCtor([], intType), fnType, "fix function");
	}
}

export function validateFixArity(
	fnType: { kind: "fn"; params: Type[]; returns: Type },
	exprType: Type,
): void {
	if (fnType.params.length !== 1) {
		throw SPIRALError.arityError(1, fnType.params.length, "fix");
	}
	validateFixParamReturn(fnType, exprType);
}

function validateFixParamReturn(
	fnType: { kind: "fn"; params: Type[]; returns: Type },
	exprType: Type,
): void {
	const firstParam = fnType.params[0];
	if (firstParam === undefined) {
		throw SPIRALError.validation("fix", "Missing parameter type");
	}
	if (!typeEqual(firstParam, fnType.returns)) {
		throw SPIRALError.typeError(firstParam, fnType.returns, "fix");
	}
	if (!typeEqual(fnType.returns, exprType)) {
		throw SPIRALError.typeError(exprType, fnType.returns, "fix");
	}
}
