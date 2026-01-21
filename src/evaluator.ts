// CAIRS Evaluator
// Implements big-step evaluation: ρ ⊢ e ⇓ v

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import {
  Defs,
  ValueEnv,
  emptyValueEnv,
  extendValueEnv,
  lookupDef,
  lookupValue,
} from "./env.js";
import { CAIRSError, ErrorCodes, exhaustive } from "./errors.js";
import type { AIRDocument, Expr, Node, Type, Value } from "./types.js";
import {
  boolVal,
  closureVal,
  errorVal,
  floatVal,
  hashValue,
  intVal,
  isError,
  listVal,
  mapVal,
  opaqueVal,
  optionVal,
  setVal,
  stringVal,
} from "./types.js";

//==============================================================================
// Evaluation Options
//==============================================================================

export interface EvalOptions {
	maxSteps?: number;
	trace?: boolean;
}

//==============================================================================
// Evaluator State
//==============================================================================

interface EvalState {
	steps: number;
	maxSteps: number;
	trace: boolean;
}

//==============================================================================
// Evaluator Class
//==============================================================================

export class Evaluator {
	private registry: OperatorRegistry;
	private defs: Defs;

	constructor(registry: OperatorRegistry, defs: Defs) {
		this.registry = registry;
		this.defs = defs;
	}

	/**
	 * Evaluate an expression: ρ ⊢ e ⇓ v
	 */
	evaluate(expr: Expr, env: ValueEnv, options?: EvalOptions): Value {
		const state: EvalState = {
			steps: 0,
			maxSteps: options?.maxSteps ?? 10000,
			trace: options?.trace ?? false,
		};

		return this.evalExpr(expr, env, state);
	}

	/**
	 * E-Lit: ρ ⊢ lit(t, v) ⇓ v
	 */
	private evalExpr(expr: Expr, env: ValueEnv, state: EvalState): Value {
		this.checkSteps(state);

		switch (expr.kind) {
			case "lit":
				return this.evalLit(expr, env, state);

			case "var":
				return this.evalVar(expr, env, state);

			case "ref":
				throw new Error("Ref must be resolved during program evaluation");

			case "call":
				return this.evalCall(expr, env, state);

			case "if":
				return this.evalIf(expr, env, state);

			case "let":
				return this.evalLet(expr, env, state);

			case "airRef":
				return this.evalAirRef(expr, env, state);

			case "predicate":
				return this.evalPredicate(expr, env, state);

			case "lambda":
				return this.evalLambda(expr, env, state);

			case "callExpr":
				return this.evalCallExpr(expr, env, state);

			case "fix":
				return this.evalFix(expr, env, state);

			default:
				return exhaustive(expr);
		}
	}

	private evalLit(
		expr: { kind: "lit"; type: Type; value: unknown },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		const t = expr.type;
		const v = expr.value;

		switch (t.kind) {
			case "bool":
				return boolVal(Boolean(v));
			case "int":
				return intVal(Number(v));
			case "float":
				return floatVal(Number(v));
			case "string":
				return stringVal(String(v));
			case "list":
				if (!Array.isArray(v))
					return errorVal(ErrorCodes.TypeError, "List value must be array");
				return listVal(v as Value[]);
			case "set":
				if (!Array.isArray(v))
					return errorVal(ErrorCodes.TypeError, "Set value must be array");
				return setVal(new Set((v as Value[]).map(hashValue)));
			case "map":
				if (!Array.isArray(v))
					return errorVal(ErrorCodes.TypeError, "Map value must be array");
				return mapVal(
					new Map(
						(v as [Value, Value][]).map(([k, val]) => [hashValue(k), val]),
					),
				);
			case "option":
				return v === null ? optionVal(null) : optionVal(v as Value);
			case "opaque":
				return opaqueVal(t.name, v);
			default:
				return errorVal(
					ErrorCodes.TypeError,
					"Cannot create literal for type: " + t.kind,
				);
		}
	}

	/**
	 * E-Var: ρ(x) = v
	 *          -------
	 *          ρ ⊢ var(x) ⇓ v
	 */
	private evalVar(
		expr: { kind: "var"; name: string },
		env: ValueEnv,
		_state: EvalState,
	): Value {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Unbound identifier: " + expr.name,
			);
		}
		return value;
	}

	/**
	 * E-Call: ρ ⊢ args[i] ⇓ vi    op(v1,...,vn) ⇓ v
	 *         ----------------------------------------
	 *                    ρ ⊢ call(ns:name, args) ⇓ v
	 */
	private evalCall(
		_expr: { kind: "call"; ns: string; name: string; args: string[] },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Arguments are node refs, resolved during program evaluation
		// This is a placeholder - actual evaluation is done by the program evaluator
		throw new Error("Call must be resolved during program evaluation");
	}

	/**
	 * E-IfTrue: ρ ⊢ cond ⇓ true    ρ ⊢ then ⇓ v
	 *           -----------------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ v
	 *
	 * E-IfFalse: ρ ⊢ cond ⇓ false    ρ ⊢ else ⇓ v
	 *           ---------------------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ v
	 *
	 * E-IfCondErr: ρ ⊢ cond ⇓ Err
	 *           -------------------
	 *                    ρ ⊢ if(cond, then, else) ⇓ Err
	 */
	private evalIf(
		_expr: { kind: "if"; cond: string; then: string; else: string; type: Type },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Branches are node refs, resolved during program evaluation
		throw new Error("If must be resolved during program evaluation");
	}

	/**
	 * E-Let: ρ ⊢ value ⇓ v1    ρ, x:v1 ⊢ body ⇓ v2
	 *        -----------------------------------------
	 *                ρ ⊢ let(x, value, body) ⇓ v2
	 *
	 * E-LetErr: ρ ⊢ value ⇓ Err
	 *           ----------------
	 *           ρ ⊢ let(x, value, body) ⇓ Err
	 */
	private evalLet(
		_expr: { kind: "let"; name: string; value: string; body: string },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Value and body are node refs, resolved during program evaluation
		throw new Error("Let must be resolved during program evaluation");
	}

	/**
	 * E-AirRef: Capture-avoiding inlining of airDef body
	 */
	private evalAirRef(
		_expr: { kind: "airRef"; ns: string; name: string; args: string[] },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Arguments are node refs, resolved during program evaluation
		throw new Error("AirRef must be resolved during program evaluation");
	}

	/**
	 * E-Pred: Create a predicate value
	 */
	private evalPredicate(
		_expr: { kind: "predicate"; name: string; value: string },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Value is a node ref, resolved during program evaluation
		throw new Error("Predicate must be resolved during program evaluation");
	}

	/**
	 * E-Λ: ρ ⊢ lambda(params, body) ⇓ ⟨params, body, ρ⟩
	 */
	private evalLambda(
		_expr: { kind: "lambda"; params: string[]; body: string; type: Type },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Body is a node ref, resolved during program evaluation
		throw new Error("Lambda must be resolved during program evaluation");
	}

	/**
	 * E-CallExpr: ρ ⊢ fn ⇓ ⟨params, body, ρ'⟩    ρ ⊢ args[i] ⇓ vi
	 *             ρ', params:vi ⊢ body ⇓ v
	 *             -----------------------------------------
	 *                      ρ ⊢ callExpr(fn, args) ⇓ v
	 */
	private evalCallExpr(
		_expr: { kind: "callExpr"; fn: string; args: string[] },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Fn and args are node refs, resolved during program evaluation
		throw new Error("CallExpr must be resolved during program evaluation");
	}

	/**
	 * E-Fix: ρ ⊢ fn ⇓ ⟨[x], body, ρ'⟩    ρ', x:fix(fn) ⊢ body ⇓ v
	 *        --------------------------------------------------
	 *                      ρ ⊢ fix(fn) ⇓ v
	 */
	private evalFix(
		_expr: { kind: "fix"; fn: string; type: Type },
		_env: ValueEnv,
		_state: EvalState,
	): Value {
		// Fn is a node ref, resolved during program evaluation
		throw new Error("Fix must be resolved during program evaluation");
	}

	private checkSteps(state: EvalState): void {
		state.steps++;
		if (state.steps > state.maxSteps) {
			throw CAIRSError.nonTermination();
		}
	}
}

//==============================================================================
// Program Evaluation
//==============================================================================

/**
 * Evaluate a full AIR/CIR program.
 */
export function evaluateProgram(
	doc: AIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
	inputs?: Map<string, Value>,
	options?: EvalOptions,
): Value {
	const evaluator = new Evaluator(registry, defs);
	const nodeMap = new Map<string, Node>();
	const nodeValues = new Map<string, Value>();

	// Build a map of nodes and find nodes that are "bound" (referenced as body in let/if)
	const boundNodes = new Set<string>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
		const expr = node.expr;
		// Nodes referenced as bodies in let/if/lambda are "bound" and should not be evaluated in the main loop
		if (expr.kind === "let") {
			boundNodes.add(expr.body);
		} else if (expr.kind === "if") {
			boundNodes.add(expr.then);
			boundNodes.add(expr.else);
		} else if (expr.kind === "lambda") {
			boundNodes.add(expr.body);
		}
	}

	// Start with input environment
	let env = inputs ?? emptyValueEnv();

	// Evaluate each node in order (except bound nodes)
	for (const node of doc.nodes) {
		// Skip nodes that are bound by let/if/lambda - they'll be evaluated when needed
		if (boundNodes.has(node.id)) {
			continue;
		}

		const result = evalNode(evaluator, node, nodeMap, nodeValues, env, options);
		nodeValues.set(node.id, result.value);

		// Propagate errors
		if (isError(result.value)) {
			return result.value;
		}

		env = result.env;
	}

	// Return the result node's value
	const resultValue = nodeValues.get(doc.result);
	if (!resultValue) {
		// If result node hasn't been evaluated, it might be a bound node
		const resultNode = nodeMap.get(doc.result);
		if (resultNode) {
			const result = evalNode(
				evaluator,
				resultNode,
				nodeMap,
				nodeValues,
				env,
				options,
			);
			return result.value;
		}
		return errorVal(
			ErrorCodes.DomainError,
			"Result node not evaluated: " + doc.result,
		);
	}

	return resultValue;
}

interface NodeEvalResult {
	value: Value;
	env: ValueEnv;
}

function evalNode(
	evaluator: Evaluator,
	node: Node,
	nodeMap: Map<string, Node>,
	nodeValues: Map<string, Value>,
	env: ValueEnv,
	options?: EvalOptions,
): NodeEvalResult {
	const expr = node.expr;
	const state: EvalState = {
		steps: 0,
		maxSteps: options?.maxSteps ?? 10000,
		trace: options?.trace ?? false,
	};

	switch (expr.kind) {
		case "lit": {
			const value = evaluator["evalLit"](expr, env, state);
			return { value, env };
		}

		case "var": {
			const value = evaluator["evalVar"](expr, env, state);
			return { value, env };
		}

		case "ref": {
			// Look up the referenced node's value
			const value = nodeValues.get(expr.id);
			if (!value) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Referenced node not evaluated: " + expr.id,
					),
					env,
				};
			}
			return { value, env };
		}

		case "call": {
			// Evaluate arguments and apply operator
			const argValues: Value[] = [];
			for (const argId of expr.args) {
				// First try to get the value from nodeValues (for node references)
				let argValue = nodeValues.get(argId);

				// If not found, try looking up as a variable in the environment
				if (!argValue) {
					argValue = lookupValue(env, argId);
				}

				if (!argValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Argument not found: " + argId,
						),
						env,
					};
				}
				if (isError(argValue)) {
					return { value: argValue, env };
				}
				argValues.push(argValue);
			}

			const op = lookupOperator(evaluator["registry"], expr.ns, expr.name);
			if (!op) {
				return {
					value: errorVal(
						ErrorCodes.UnknownOperator,
						"Unknown operator: " + expr.ns + ":" + expr.name,
					),
					env,
				};
			}

			// Check arity
			if (op.params.length !== argValues.length) {
				return {
					value: errorVal(
						ErrorCodes.ArityError,
						"Arity error: " + expr.ns + ":" + expr.name,
					),
					env,
				};
			}

			// Apply operator
			try {
				const value = op.fn(...argValues);
				return { value, env };
			} catch (e) {
				if (e instanceof CAIRSError) {
					return { value: e.toValue(), env };
				}
				return { value: errorVal(ErrorCodes.DomainError, String(e)), env };
			}
		}

		case "if": {
			const condValue = nodeValues.get(expr.cond);
			if (!condValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Condition node not evaluated: " + expr.cond,
					),
					env,
				};
			}
			if (isError(condValue)) {
				return { value: condValue, env };
			}

			const branchId =
				condValue.kind === "bool" && condValue.value ? expr.then : expr.else;
			const branchNode = nodeMap.get(branchId);
			if (!branchNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Branch node not found: " + branchId,
					),
					env,
				};
			}

			// Evaluate the branch node directly (it might be a bound node not in nodeValues)
			const branchResult = evalNode(
				evaluator,
				branchNode,
				nodeMap,
				nodeValues,
				env,
				options,
			);
			return { value: branchResult.value, env };
		}

		case "let": {
			const valueNodeValue = nodeValues.get(expr.value);
			if (!valueNodeValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Value node not evaluated: " + expr.value,
					),
					env,
				};
			}
			if (isError(valueNodeValue)) {
				return { value: valueNodeValue, env };
			}

			const extendedEnv = extendValueEnv(env, expr.name, valueNodeValue);

			// Get the body node and evaluate it with the extended environment
			const bodyNode = nodeMap.get(expr.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + expr.body,
					),
					env,
				};
			}

			// Handle var expressions - look up directly in extended environment
			if (bodyNode.expr.kind === "var") {
				const varExpr = bodyNode.expr as { kind: "var"; name: string };
				const varValue = lookupValue(extendedEnv, varExpr.name);
				if (varValue) {
					return { value: varValue, env: extendedEnv };
				}
				return {
					value: errorVal(
						ErrorCodes.UnboundIdentifier,
						"Unbound identifier: " + varExpr.name,
					),
					env,
				};
			}

			// Handle lit expressions - just return the literal value
			if (bodyNode.expr.kind === "lit") {
				const litValue = evaluator["evalLit"](
					bodyNode.expr as any,
					extendedEnv,
					state,
				);
				return { value: litValue, env: extendedEnv };
			}

			// Handle ref expressions - get value from nodeValues
			if (bodyNode.expr.kind === "ref") {
				const refExpr = bodyNode.expr as { kind: "ref"; id: string };
				const refValue = nodeValues.get(refExpr.id);
				if (!refValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Referenced node not evaluated: " + refExpr.id,
						),
						env,
					};
				}
				return { value: refValue, env: extendedEnv };
			}

			// For bound nodes (let/if/lambda bodies), use evalNode with extended environment
			// For other expressions, evaluate with the extended environment
			const bodyResult = evalNode(
				evaluator,
				bodyNode,
				nodeMap,
				nodeValues,
				extendedEnv,
				options,
			);
			return { value: bodyResult.value, env: bodyResult.env };
		}

		case "airRef": {
			// Get the airDef
			const def = lookupDef(evaluator["defs"], expr.ns, expr.name);
			if (!def) {
				return {
					value: errorVal(
						ErrorCodes.UnknownDefinition,
						"Unknown definition: " + expr.ns + ":" + expr.name,
					),
					env,
				};
			}

			// Check arity
			if (def.params.length !== expr.args.length) {
				return {
					value: errorVal(
						ErrorCodes.ArityError,
						"Arity error for airDef: " + expr.ns + ":" + expr.name,
					),
					env,
				};
			}

			// Get argument values
			const argValues: Value[] = [];
			for (const argId of expr.args) {
				const argValue = nodeValues.get(argId);
				if (!argValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Argument node not evaluated: " + argId,
						),
						env,
					};
				}
				if (isError(argValue)) {
					return { value: argValue, env };
				}
				argValues.push(argValue);
			}

			// Create environment with argument bindings
			let defEnv = emptyValueEnv();
			for (let i = 0; i < def.params.length; i++) {
				defEnv = extendValueEnv(defEnv, def.params[i]!, argValues[i]!!);
			}

			// Evaluate the def body (may contain refs that need capture-avoiding substitution)
			// For simplicity, we evaluate the body directly in the defEnv
			const defEvaluator = new Evaluator(
				evaluator["registry"],
				evaluator["defs"],
			);
			const value = defEvaluator["evalExpr"](def.body, defEnv, {
				steps: 0,
				maxSteps: state.maxSteps,
				trace: state.trace,
			});
			return { value, env };
		}

		case "predicate": {
			const valueNodeValue = nodeValues.get(expr.value);
			if (!valueNodeValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Value node not evaluated: " + expr.value,
					),
					env,
				};
			}
			// Predicates create a tagged value - for now, just return bool
			return { value: boolVal(true), env };
		}

		case "lambda": {
			// Get the body expression
			const bodyNode = nodeMap.get(expr.body);
			if (!bodyNode) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Body node not found: " + expr.body,
					),
					env,
				};
			}
			// Create a closure
			const value = closureVal(expr.params, bodyNode.expr, env);
			return { value, env };
		}

		case "callExpr": {
			const fnValue = nodeValues.get(expr.fn);
			if (!fnValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Function node not evaluated: " + expr.fn,
					),
					env,
				};
			}
			if (isError(fnValue)) {
				return { value: fnValue, env };
			}
			if (fnValue.kind !== "closure") {
				return {
					value: errorVal(
						ErrorCodes.TypeError,
						"Expected closure, got: " + fnValue.kind,
					),
					env,
				};
			}

			// Get argument values
			const argValues: Value[] = [];
			for (const argId of expr.args) {
				const argValue = nodeValues.get(argId);
				if (!argValue) {
					return {
						value: errorVal(
							ErrorCodes.DomainError,
							"Argument node not evaluated: " + argId,
						),
						env,
					};
				}
				if (isError(argValue)) {
					return { value: argValue, env };
				}
				argValues.push(argValue);
			}

			// Check arity
			if (fnValue.params.length !== argValues.length) {
				return {
					value: errorVal(ErrorCodes.ArityError, "Arity error in callExpr"),
					env,
				};
			}

			// Extend closure environment with arguments
			let callEnv = fnValue.env;
			for (let i = 0; i < fnValue.params.length; i++) {
				callEnv = extendValueEnv(callEnv, fnValue.params[i]!, argValues[i]!!);
			}

			// Evaluate the body
			// If the body is a call expression, we need to handle it specially
			// because evalCall throws an error at the expression level
			if (fnValue.body.kind === "call") {
				const callExpr = fnValue.body as {
					kind: "call";
					ns: string;
					name: string;
					args: string[];
				};
				// Get argument values from the call environment or nodeValues
				const callArgValues: Value[] = [];
				for (const argId of callExpr.args) {
					// First try the call environment (for lambda parameters)
					let argValue = lookupValue(callEnv, argId);
					// If not found, try nodeValues (for node references)
					if (!argValue) {
						argValue = nodeValues.get(argId);
					}
					if (!argValue) {
						return {
							value: errorVal(
								ErrorCodes.DomainError,
								"Argument not found: " + argId,
							),
							env,
						};
					}
					if (isError(argValue)) {
						return { value: argValue, env };
					}
					callArgValues.push(argValue);
				}

				const op = lookupOperator(
					evaluator["registry"],
					callExpr.ns,
					callExpr.name,
				);
				if (!op) {
					return {
						value: errorVal(
							ErrorCodes.UnknownOperator,
							"Unknown operator: " + callExpr.ns + ":" + callExpr.name,
						),
						env,
					};
				}

				if (op.params.length !== callArgValues.length) {
					return {
						value: errorVal(
							ErrorCodes.ArityError,
							"Arity error: " + callExpr.ns + ":" + callExpr.name,
						),
						env,
					};
				}

				try {
					const value = op.fn(...callArgValues);
					return { value, env };
				} catch (e) {
					if (e instanceof CAIRSError) {
						return { value: e.toValue(), env };
					}
					return { value: errorVal(ErrorCodes.DomainError, String(e)), env };
				}
			}

			// For other body kinds, use evalExpr
			const fnEvaluator = new Evaluator(
				evaluator["registry"],
				evaluator["defs"],
			);
			const value = fnEvaluator["evalExpr"](fnValue.body, callEnv, state);
			return { value, env };
		}

		case "fix": {
			const fnValue = nodeValues.get(expr.fn);
			if (!fnValue) {
				return {
					value: errorVal(
						ErrorCodes.DomainError,
						"Function node not evaluated: " + expr.fn,
					),
					env,
				};
			}
			if (isError(fnValue)) {
				return { value: fnValue, env };
			}
			if (fnValue.kind !== "closure") {
				return {
					value: errorVal(
						ErrorCodes.TypeError,
						"Expected closure, got: " + fnValue.kind,
					),
					env,
				};
			}

			// Fix requires a single-parameter closure
			if (fnValue.params.length !== 1) {
				return {
					value: errorVal(
						ErrorCodes.ArityError,
						"Fix requires single-parameter function",
					),
					env,
				};
			}

			// Create the fixed point by unrolling: fix(f) = f(fix(f))
			// We represent this as a self-referential closure
			const param = fnValue.params[0]!;

			// Create a thunk that represents the fixed point
			const fixValue = closureVal([param], fnValue.body, fnValue.env);

			// The fixpoint value is the closure itself
			return { value: fixValue, env };
		}

		default:
			return { value: exhaustive(expr), env };
	}
}
