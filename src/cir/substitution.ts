// SPIRAL CIR Substitution
// Capture-avoiding substitution for CIR expressions

import type { ValueEnv } from "../env.js";
import type { Expr, LambdaExpr, LambdaParam, Value } from "../types.js";

const paramName = (p: string | LambdaParam): string => typeof p === "string" ? p : p.name;

//==============================================================================
// Fresh Name Generation
//==============================================================================

/**
 * Generate a fresh name that doesn't conflict with names in the given context.
 * Names are generated like "__spiral_0", "__spiral_1", etc.
 */
export function freshName(base: string, context: Set<string>): string {
	let candidate = base;
	let counter = 0;
	while (context.has(candidate)) {
		counter++;
		candidate = "__spiral_" + String(counter);
	}
	return candidate;
}

//==============================================================================
// Capture-Avoiding Substitution
//==============================================================================

interface SubstContext {
	varName: string;
	value: Expr;
	boundVars: Set<string>;
}

/** Kinds that are pass-through for substitution (use string refs only). */
const substPassthroughKinds = new Set([
	"call", "if", "airRef", "predicate", "callExpr", "fix", "do",
	"par", "spawn", "await", "channel", "send", "recv", "select", "race",
]);

/**
 * Perform capture-avoiding substitution: e[x := v]
 * Replace all free occurrences of x in e with value v.
 */
export function substitute(expr: Expr, varName: string, value: Expr): Expr {
	return substituteExpr(expr, { varName, value, boundVars: new Set() });
}

/** Handle substitution in lambda expressions (capture-avoiding). */
function substituteLambda(expr: LambdaExpr, ctx: SubstContext): Expr {
	// If varName is captured by lambda parameters, it's shadowed
	if (expr.params.map(paramName).includes(ctx.varName)) {
		return expr;
	}

	const paramsSet = new Set(expr.params.map(paramName));
	const capturedInValue = collectFreeVars(ctx.value, new Set())
		.filter((v) => paramsSet.has(v));

	if (capturedInValue.length === 0) {
		return { ...expr };
	}

	// Capture would occur - alpha-rename the lambda parameters
	const paramRenaming = buildParamRenaming(expr.params.map(paramName), {
		capturedInValue, paramsSet, boundVars: ctx.boundVars, varName: ctx.varName,
	});

	if (paramRenaming.size === 0) {
		return expr;
	}

	return alphaRenameExpr(expr, { boundVars: new Set(), renaming: paramRenaming });
}

interface ParamRenamingContext {
	capturedInValue: string[];
	paramsSet: Set<string>;
	boundVars: Set<string>;
	varName: string;
}

/** Build a renaming map for lambda params that would cause capture. */
function buildParamRenaming(
	params: string[],
	ctx: ParamRenamingContext,
): Map<string, string> {
	const paramRenaming = new Map<string, string>();
	for (const param of params) {
		if (ctx.capturedInValue.includes(param)) {
			const allNames = new Set(Array.from(ctx.paramsSet).concat(Array.from(ctx.boundVars)).concat([ctx.varName]));
			const newName = freshName(param, allNames);
			paramRenaming.set(param, newName);
		}
	}
	return paramRenaming;
}

function substituteExpr(expr: Expr, ctx: SubstContext): Expr {
	if (substPassthroughKinds.has(expr.kind)) {
		return { ...expr };
	}

	switch (expr.kind) {
	case "lit":
	case "ref":
		return expr;

	case "var":
		if (expr.name === ctx.varName && !ctx.boundVars.has(ctx.varName)) {
			return ctx.value;
		}
		return expr;

	case "let": {
		const newLetBoundVars = new Set(ctx.boundVars);
		newLetBoundVars.add(expr.name);
		return { ...expr };
	}

	case "lambda":
		return substituteLambda(expr, ctx);

	default:
		return { ...expr };
	}
}

//==============================================================================
// Free Variable Collection
//==============================================================================

/** Kinds that never contain free variables (use string refs). */
const noFreeVarKinds = new Set([
	"lit", "ref", "call", "if", "airRef", "predicate",
	"callExpr", "fix", "do",
	"par", "spawn", "await", "channel", "send", "recv", "select", "race",
]);

/**
 * Collect all free variables in an expression.
 * A variable is free if it is not bound by any enclosing lambda/let.
 */
export function collectFreeVars(expr: Expr, boundVars: Set<string>): string[] {
	if (noFreeVarKinds.has(expr.kind)) {
		return [];
	}

	switch (expr.kind) {
	case "var":
		return boundVars.has(expr.name) ? [] : [expr.name];

	case "let": {
		const newBoundVars = new Set(boundVars);
		newBoundVars.add(expr.name);
		return [];
	}

	case "lambda": {
		const lambdaBoundVars = new Set(boundVars);
		for (const param of expr.params) {
			lambdaBoundVars.add(paramName(param));
		}
		return [];
	}

	default:
		return [];
	}
}

//==============================================================================
// Alpha Renaming
//==============================================================================

interface RenameContext {
	boundVars: Set<string>;
	renaming: Map<string, string>;
}

/** Kinds that are pass-through for alpha renaming. */
const renamePassthroughKinds = new Set([
	"call", "if", "let", "airRef", "predicate", "callExpr", "fix", "do",
	"par", "spawn", "await", "channel", "send", "recv", "select", "race",
]);

/**
 * Rename variables in an expression.
 * oldVars and newVars must have the same length.
 */
export function alphaRename(
	expr: Expr,
	oldVars: string[],
	newVars: string[],
): Expr {
	if (oldVars.length !== newVars.length) {
		throw new Error(
			"alphaRename: oldVars and newVars must have the same length",
		);
	}

	const renaming = new Map<string, string>();
	for (let i = 0; i < oldVars.length; i++) {
		const oldVar = oldVars[i];
		const newVar = newVars[i];
		if (oldVar !== undefined && newVar !== undefined) {
			renaming.set(oldVar, newVar);
		}
	}

	return alphaRenameExpr(expr, { boundVars: new Set(), renaming });
}

/** Handle alpha-renaming for a var expression. */
function renameVar(expr: Expr & { kind: "var" }, ctx: RenameContext): Expr {
	if (ctx.renaming.has(expr.name) && !ctx.boundVars.has(expr.name)) {
		const newName = ctx.renaming.get(expr.name);
		if (newName !== undefined) {
			return { ...expr, name: newName };
		}
	}
	return expr;
}

/** Rename a single lambda parameter if it appears in the renaming map. */
function renameOneParam(
	param: string,
	ctx: RenameContext,
	newBoundVars: Set<string>,
): { newName: string; renamed: boolean } {
	if (ctx.renaming.has(param)) {
		const baseName = ctx.renaming.get(param);
		if (baseName !== undefined) {
			const fresh = freshName(baseName, newBoundVars);
			return { newName: fresh, renamed: true };
		}
	}
	return { newName: param, renamed: false };
}

/** Compute renamed params for a lambda. Returns [newParams, changed]. */
function computeRenamedParams(
	params: string[],
	ctx: RenameContext,
): [string[], boolean] {
	const newBoundVars = new Set(ctx.boundVars);
	let changeCount = 0;

	const newParams = params.map((param) => {
		newBoundVars.add(param);
		const result = renameOneParam(param, ctx, newBoundVars);
		if (result.renamed) {
			changeCount++;
			newBoundVars.add(result.newName);
		}
		return result.newName;
	});

	return [newParams, changeCount > 0];
}

/** Handle alpha-renaming for a lambda expression. */
function renameLambda(expr: LambdaExpr, ctx: RenameContext): Expr {
	const [newParams, changed] = computeRenamedParams(expr.params.map(paramName), ctx);
	return changed ? { ...expr, params: newParams } : expr;
}

function alphaRenameExpr(expr: Expr, ctx: RenameContext): Expr {
	if (renamePassthroughKinds.has(expr.kind)) {
		return { ...expr };
	}

	switch (expr.kind) {
	case "lit":
	case "ref":
		return expr;

	case "var":
		return renameVar(expr, ctx);

	case "lambda":
		return renameLambda(expr, ctx);

	default:
		return { ...expr };
	}
}

//==============================================================================
// Value-Level Substitution (Environment-based)
//==============================================================================

/**
 * Substitute values into an environment.
 * This is used when evaluating closures and airDefs.
 */
export function substituteEnv(
	env: ValueEnv,
	varName: string,
	value: Value,
): ValueEnv {
	const newEnv = new Map(env);
	newEnv.set(varName, value);
	return newEnv;
}
