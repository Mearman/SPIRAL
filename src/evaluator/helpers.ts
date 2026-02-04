// Evaluator class and shared helper functions

import { lookupOperator, type OperatorRegistry } from "../domains/registry.ts";
import {
	type Defs,
	type ValueEnv,
	extendValueEnv,
	lookupValue,
} from "../env.ts";
import { SPIRALError, ErrorCodes } from "../errors.ts";
import {
	type Expr,
	type Type,
	type Value,
	voidVal,
} from "../types.ts";
import {
	boolVal,
	errorVal,
	floatVal,
	intVal,
	isError,
	stringVal,
} from "../types.ts";
import type { EvalContext, EvalOptions } from "./types.ts";
import { evalLitValue } from "./lit-eval.ts";

//==============================================================================
// Evaluator Class
//==============================================================================

export class Evaluator {
	private readonly _registry: OperatorRegistry;
	private readonly _defs: Defs;

	constructor(registry: OperatorRegistry, defs: Defs) {
		this._registry = registry;
		this._defs = defs;
	}

	get registry(): OperatorRegistry {
		return this._registry;
	}

	get defs(): Defs {
		return this._defs;
	}

	evaluate(expr: Expr, env: ValueEnv, options?: EvalOptions): Value {
		const state: EvalContext = {
			steps: 0,
			maxSteps: options?.maxSteps ?? 10000,
			trace: options?.trace ?? false,
		};
		return this.evalExpr(expr, env, state);
	}

	evaluateWithState(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		return this.evalExpr(expr, env, state);
	}

	private evalExpr(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		this.checkSteps(state);
		return this.dispatchExpr(expr, env, state);
	}

	private checkSteps(state: EvalContext): void {
		state.steps++;
		if (state.steps > state.maxSteps) {
			throw SPIRALError.nonTermination();
		}
	}

	private dispatchExpr(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		if (isProgramEvalKind(expr.kind)) {
			throw new Error(expr.kind + " must be resolved during program evaluation");
		}
		if (isAsyncKind(expr.kind)) {
			return errorVal(
				ErrorCodes.DomainError,
				"Async expressions require AsyncEvaluator: " + expr.kind,
			);
		}
		return this.dispatchCore(expr, env, state);
	}

	private dispatchCore(expr: Expr, env: ValueEnv, state: EvalContext): Value {
		switch (expr.kind) {
		case "lit":
			return evalLitValue(expr);
		case "var":
			return evalVarSimple(expr, env);
		case "ref":
			return evalRefSimple(expr, env);
		case "call":
			return this.evalCallSimple(expr, env, state);
		case "if":
			return this.evalIfSimple(expr, env, state);
		case "let":
			return this.evalLetSimple(expr, env, state);
		case "do":
			return this.evalDoSimple(expr, env, state);
		default:
			return errorVal(ErrorCodes.DomainError, "Unsupported expression kind: " + expr.kind);
		}
	}

	private evalCallSimple(
		expr: { ns: string; name: string; args: (string | Expr)[] },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		if (!expr.args.some(arg => typeof arg !== "string")) {
			throw new Error("Call must be resolved during program evaluation");
		}
		const ctx: EvalRef = { ev: this, env, state };
		const argValues = resolveArgList(ctx, expr.args);
		if (!Array.isArray(argValues)) return argValues;
		return applyOperator(
			{ registry: this._registry, ns: expr.ns, name: expr.name },
			argValues,
		);
	}

	private evalIfSimple(
		expr: { cond: string | Expr; then: string | Expr; else: string | Expr },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		if (allStrings(expr.cond, expr.then, expr.else)) {
			throw new Error("If must be resolved during program evaluation");
		}
		const ctx: EvalRef = { ev: this, env, state };
		const condValue = resolveRef(ctx, expr.cond);
		if (isError(condValue)) return condValue;
		const branch = condValue.kind === "bool" && condValue.value
			? expr.then : expr.else;
		return resolveRef(ctx, branch);
	}

	private evalLetSimple(
		expr: { name: string; value: string | Expr; body: string | Expr },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		if (allStrings(expr.value, expr.body)) {
			throw new Error("Let must be resolved during program evaluation");
		}
		const ctx: EvalRef = { ev: this, env, state };
		const val = resolveRef(ctx, expr.value);
		if (isError(val)) return val;
		const bodyCtx: EvalRef = { ev: this, env: extendValueEnv(env, expr.name, val), state };
		return resolveRef(bodyCtx, expr.body);
	}

	private evalDoSimple(
		expr: { exprs: (string | Expr)[] },
		env: ValueEnv,
		state: EvalContext,
	): Value {
		if (expr.exprs.length === 0) return voidVal();
		let result: Value = voidVal();
		for (const e of expr.exprs) {
			if (typeof e === "string") {
				throw new Error("Do expr node refs must be resolved during program evaluation");
			}
			result = this.evaluateWithState(e, env, state);
			if (isError(result)) return result;
		}
		return result;
	}
}

//==============================================================================
// Small shared helpers
//==============================================================================

function allStrings(...refs: (string | Expr)[]): boolean {
	return refs.every(r => typeof r === "string");
}

interface EvalRef {
	ev: Evaluator;
	env: ValueEnv;
	state: EvalContext;
}

function resolveRef(ctx: EvalRef, ref: string | Expr): Value {
	if (typeof ref === "string") {
		const value = ctx.env.get(ref);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + ref);
		}
		return value;
	}
	return ctx.ev.evaluateWithState(ref, ctx.env, ctx.state);
}

function resolveArgList(ctx: EvalRef, args: (string | Expr)[]): Value[] | Value {
	const argValues: Value[] = [];
	for (const arg of args) {
		const value = resolveRef(ctx, arg);
		if (isError(value)) return value;
		argValues.push(value);
	}
	return argValues;
}

const PROGRAM_EVAL_KINDS = new Set([
	"airRef", "predicate", "lambda", "callExpr", "fix",
]);

const ASYNC_KINDS = new Set([
	"par", "spawn", "await", "channel", "send", "recv", "select", "race",
]);

function isProgramEvalKind(kind: string): boolean {
	return PROGRAM_EVAL_KINDS.has(kind);
}

function isAsyncKind(kind: string): boolean {
	return ASYNC_KINDS.has(kind);
}

function evalVarSimple(expr: { name: string }, env: ValueEnv): Value {
	const value = lookupValue(env, expr.name);
	if (!value) {
		return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
	}
	return value;
}

function evalRefSimple(expr: { id: string }, env: ValueEnv): Value {
	const refValue = env.get(expr.id);
	if (refValue) return refValue;
	throw new Error("Ref must be resolved during program evaluation");
}

export interface OpCall {
	registry: OperatorRegistry;
	ns: string;
	name: string;
}

/** Apply a registry operator to argument values. */
export function applyOperator(op: OpCall, argValues: Value[]): Value {
	const resolved = lookupOperator(op.registry, op.ns, op.name);
	if (!resolved) {
		return errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + op.ns + ":" + op.name);
	}
	if (resolved.params.length !== argValues.length) {
		return errorVal(
			ErrorCodes.ArityError,
			`Arity mismatch: ${resolved.params.length} expected, ${argValues.length} given`,
		);
	}
	return resolved.fn(...argValues);
}

/** Simple literal evaluator for block instructions. */
export function evaluateLitExpr(
	expr: { kind: "lit"; type: Type; value: unknown },
): Value {
	switch (expr.type.kind) {
	case "bool":
		return boolVal(Boolean(expr.value));
	case "int":
		return intVal(Number(expr.value));
	case "float":
		return floatVal(Number(expr.value));
	case "string":
		return stringVal(String(expr.value));
	case "void":
		return voidVal();
	default:
		return errorVal(
			ErrorCodes.TypeError,
			"Complex literals not yet supported in blocks",
		);
	}
}
