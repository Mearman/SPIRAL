// SPIRAL Schema Validator
// Manual structural validation for AIR and CIR documents

import {
	invalidResult,
	ValidationError,
	ValidationResult,
	validResult,
} from "./errors.js";
import type { AIRDef, AIRDocument, CIRDocument, Expr, Type } from "./types.js";

//==============================================================================
// Validation Patterns
//==============================================================================

const ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

//==============================================================================
// Validation State
//==============================================================================

interface ValidationState {
	errors: ValidationError[];
	path: string[];
}

function pushPath(state: ValidationState, segment: string): void {
	state.path.push(segment);
}

function popPath(state: ValidationState): void {
	state.path.pop();
}

function currentPath(state: ValidationState): string {
	return state.path.length > 0 ? state.path.join(".") : "$";
}

function addError(
	state: ValidationState,
	message: string,
	value?: unknown,
): void {
	state.errors.push({
		path: currentPath(state),
		message,
		value,
	});
}

//==============================================================================
// Primitive Validators
//==============================================================================

function validateString(value: unknown): value is string {
	return typeof value === "string";
}

function validateArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

function validateObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(value: unknown): value is string {
	return typeof value === "string" && ID_PATTERN.test(value);
}

function validateVersion(value: unknown): value is string {
	return typeof value === "string" && SEMVER_PATTERN.test(value);
}

//==============================================================================
// Document Type Assertions
//==============================================================================

function assertAIRDocument(_doc: Record<string, unknown>): asserts _doc is Record<string, unknown> & AIRDocument {
	// Validation already performed above
}

function assertCIRDocument(_doc: Record<string, unknown>): asserts _doc is Record<string, unknown> & CIRDocument {
	// Validation already performed above
}

function assertEIRDocument(_doc: Record<string, unknown>): asserts _doc is Record<string, unknown> & import("./types.js").EIRDocument {
	// Validation already performed above
}

function assertLIRDocument(_doc: Record<string, unknown>): asserts _doc is Record<string, unknown> & import("./types.js").LIRDocument {
	// Validation already performed above
}

function assertPIRDocument(_doc: Record<string, unknown>): asserts _doc is Record<string, unknown> & import("./types.js").PIRDocument {
	// Validation already performed above
}

//==============================================================================
// Type Validation
//==============================================================================

function validateType(state: ValidationState, value: unknown): value is Type {
	if (!validateObject(value)) {
		addError(state, "Type must be an object", value);
		return false;
	}

	// value is now Record<string, unknown> due to type predicate
	const kind = value.kind;
	if (!validateString(kind)) {
		addError(state, "Type must have 'kind' property", value);
		return false;
	}

	switch (kind) {
	case "bool":
	case "int":
	case "float":
	case "string":
		return true;

	case "set":
		// Sets can use 'of', 'elem', or 'elementType' for the element type
		if (!value.of && !value.elem && !value.elementType) {
			addError(state, "set type must have 'of', 'elem', or 'elementType' property", value);
			return false;
		}
		{
			const elemProp = value.of ?? value.elem ?? value.elementType;
			const propName = value.of ? "of" : value.elem ? "elem" : "elementType";
			pushPath(state, propName);
			const ofValid = validateType(state, elemProp);
			popPath(state);
			return ofValid;
		}

	case "list":
	case "option": {
		if (!value.of) {
			addError(state, kind + " type must have 'of' property", value);
			return false;
		}
		pushPath(state, "of");
		const ofValid = validateType(state, value.of);
		popPath(state);
		return ofValid;
	}

	case "map": {
		if (!value.key || !value.value) {
			addError(
				state,
				"map type must have 'key' and 'value' properties",
				value,
			);
			return false;
		}
		pushPath(state, "key");
		const keyValid = validateType(state, value.key);
		popPath(state);
		pushPath(state, "value");
		const valValid = validateType(state, value.value);
		popPath(state);
		return keyValid && valValid;
	}

	case "opaque":
		if (!validateString(value.name)) {
			addError(state, "opaque type must have 'name' property", value);
			return false;
		}
		return true;

	case "fn": {
		const params = value.params;
		if (!validateArray(params)) {
			addError(state, "fn type must have 'params' array", value);
			return false;
		}
		if (!value.returns) {
			addError(state, "fn type must have 'returns' property", value);
			return false;
		}
		let paramsValid = true;
		for (let i = 0; i < params.length; i++) {
			pushPath(state, "params[" + String(i) + "]");
			if (!validateType(state, params[i])) {
				paramsValid = false;
			}
			popPath(state);
		}
		pushPath(state, "returns");
		const returnsValid = validateType(state, value.returns);
		popPath(state);
		return paramsValid && returnsValid;
	}

	default:
		addError(state, "Unknown type kind: " + kind, value);
		return false;
	}
}

//==============================================================================
// Expression Validation
//==============================================================================

function validateExpr(
	state: ValidationState,
	value: unknown,
	allowCIR: boolean,
): value is Expr {
	if (!validateObject(value)) {
		addError(state, "Expression must be an object", value);
		return false;
	}

	// value is now Record<string, unknown> due to type predicate
	const eKind = value.kind;
	if (!validateString(eKind)) {
		addError(state, "Expression must have 'kind' property", value);
		return false;
	}

	switch (eKind) {
	case "lit": {
		if (!value.type) {
			addError(state, "lit expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const typeValid = validateType(state, value.type);
		popPath(state);
		return typeValid;
	}

	case "ref":
		if (!validateId(value.id)) {
			addError(state, "ref expression must have valid 'id' property", value);
			return false;
		}
		return true;

	case "var":
		if (!validateId(value.name)) {
			addError(
				state,
				"var expression must have valid 'name' property",
				value,
			);
			return false;
		}
		return true;

	case "call":
		if (!validateId(value.ns) || !validateId(value.name)) {
			addError(
				state,
				"call expression must have valid 'ns' and 'name' properties",
				value,
			);
			return false;
		}
		{
			const callArgs = value.args;
			if (!validateArray(callArgs)) {
				addError(state, "call expression must have 'args' array", value);
				return false;
			}
			for (const arg of callArgs) {
				// Args can be either string identifiers (node refs) or inline expressions (objects)
				if (!validateId(arg) && !(typeof arg === "object" && arg !== null && "kind" in arg)) {
					addError(state, "call args must be valid identifiers or expressions", arg);
					return false;
				}
				// Validate inline expression args
				if (validateObject(arg) && "kind" in arg) {
					pushPath(state, "args");
					const argValid = validateExpr(state, arg, allowCIR);
					popPath(state);
					if (!argValid) return false;
				}
			}
		}
		return true;

	case "if": {
		// Support both node references (strings) and inline expressions (objects)
		// Node references: cond/then/else are string IDs
		// Inline expressions: cond/then/else are expression objects
		const hasNodeRefs = validateId(value.cond) && validateId(value.then) && validateId(value.else);
		const hasInlineExprs =
				typeof value.cond === "object" && value.cond !== null &&
				typeof value.then === "object" && value.then !== null &&
				typeof value.else === "object" && value.else !== null;

		if (!hasNodeRefs && !hasInlineExprs) {
			addError(
				state,
				"if expression must have 'cond', 'then', 'else' as identifiers or expressions",
				value,
			);
			return false;
		}

		// Validate inline expressions if present
		if (!hasNodeRefs) {
			// Validate cond expression
			if (validateObject(value.cond)) {
				pushPath(state, "cond");
				const condValid = validateExpr(state, value.cond, false);
				popPath(state);
				if (!condValid) return false;
			}
			// Validate then expression
			if (validateObject(value.then)) {
				pushPath(state, "then");
				const thenValid = validateExpr(state, value.then, false);
				popPath(state);
				if (!thenValid) return false;
			}
			// Validate else expression
			if (validateObject(value.else)) {
				pushPath(state, "else");
				const elseValid = validateExpr(state, value.else, false);
				popPath(state);
				if (!elseValid) return false;
			}

			// type is required for inline expressions
			if (!value.type) {
				addError(state, "if expression must have 'type' property for inline expressions", value);
				return false;
			}
			pushPath(state, "type");
			const ifTypeValid = validateType(state, value.type);
			popPath(state);
			if (!ifTypeValid) return false;
		}

		return true;
	}

	case "let": {
		// Support both node references (strings) and inline expressions (objects)
		if (!validateId(value.name)) {
			addError(state, "let expression must have 'name' identifier", value);
			return false;
		}

		// Check if value and body are node references or inline expressions
		const hasLetNodeRefs = validateId(value.value) && validateId(value.body);
		const hasLetInlineExprs =
				typeof value.value === "object" && value.value !== null &&
				typeof value.body === "object" && value.body !== null;

		if (!hasLetNodeRefs && !hasLetInlineExprs) {
			addError(
				state,
				"let expression must have 'value', 'body' as identifiers or expressions",
				value,
			);
			return false;
		}

		// Validate inline expressions if present
		if (!hasLetNodeRefs) {
			// Validate value expression
			if (validateObject(value.value)) {
				pushPath(state, "value");
				const valueValid = validateExpr(state, value.value, false);
				popPath(state);
				if (!valueValid) return false;
			}
			// Validate body expression
			if (validateObject(value.body)) {
				pushPath(state, "body");
				const bodyValid = validateExpr(state, value.body, false);
				popPath(state);
				if (!bodyValid) return false;
			}
		}

		return true;
	}

	case "airRef":
		if (!validateId(value.ns) || !validateId(value.name)) {
			addError(
				state,
				"airRef expression must have valid 'ns' and 'name' properties",
				value,
			);
			return false;
		}
		{
			const airRefArgs = value.args;
			if (!validateArray(airRefArgs)) {
				addError(state, "airRef expression must have 'args' array", value);
				return false;
			}
			for (const arg of airRefArgs) {
				if (!validateId(arg)) {
					addError(state, "airRef args must be valid identifiers", arg);
					return false;
				}
			}
		}
		return true;

	case "predicate":
		if (!validateId(value.name) || !validateId(value.value)) {
			addError(
				state,
				"predicate expression must have 'name' and 'value' identifiers",
				value,
			);
			return false;
		}
		return true;

	case "lambda": {
		if (!allowCIR) {
			addError(
				state,
				"lambda expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		const lambdaParams = value.params;
		if (!validateArray(lambdaParams)) {
			addError(state, "lambda expression must have 'params' array", value);
			return false;
		}
		for (const param of lambdaParams) {
			// Support both string identifiers and lambdaParam objects
			if (typeof param === "string") {
				if (!validateId(param)) {
					addError(state, "lambda param must be a valid identifier", param);
					return false;
				}
			} else if (validateObject(param)) {
				if (!validateId(param.name)) {
					addError(state, "lambda param must have a valid 'name' identifier", param);
					return false;
				}
				if (param.optional !== undefined && typeof param.optional !== "boolean") {
					addError(state, "lambda param 'optional' must be a boolean", param);
					return false;
				}
				if (param.default !== undefined) {
					pushPath(state, "params[" + lambdaParams.indexOf(param) + "].default");
					const defaultValid = validateExpr(state, param.default, false);
					popPath(state);
					if (!defaultValid) {
						return false;
					}
				}
			} else {
				addError(state, "lambda param must be a string or object", param);
				return false;
			}
		}
		if (!validateId(value.body)) {
			addError(state, "lambda expression must have 'body' identifier", value);
			return false;
		}
		if (!value.type) {
			addError(state, "lambda expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const lambdaTypeValid = validateType(state, value.type);
		popPath(state);
		return lambdaTypeValid;
	}

	case "callExpr":
		if (!allowCIR) {
			addError(
				state,
				"callExpr expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		if (!validateId(value.fn)) {
			addError(
				state,
				"callExpr expression must have valid 'fn' property",
				value,
			);
			return false;
		}
		{
			const callExprArgs = value.args;
			if (!validateArray(callExprArgs)) {
				addError(state, "callExpr expression must have 'args' array", value);
				return false;
			}
			for (const arg of callExprArgs) {
				// Args can be either string identifiers (node refs) or inline expressions (objects)
				if (!validateId(arg) && !(typeof arg === "object" && arg !== null && "kind" in arg)) {
					addError(state, "callExpr args must be valid identifiers or expressions", arg);
					return false;
				}
				// Validate inline expression args
				if (validateObject(arg) && "kind" in arg) {
					pushPath(state, "args");
					const argValid = validateExpr(state, arg, allowCIR);
					popPath(state);
					if (!argValid) return false;
				}
			}
		}
		return true;

	case "fix": {
		if (!allowCIR) {
			addError(
				state,
				"fix expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		if (!validateId(value.fn)) {
			addError(state, "fix expression must have valid 'fn' property", value);
			return false;
		}
		if (!value.type) {
			addError(state, "fix expression must have 'type' property", value);
			return false;
		}
		pushPath(state, "type");
		const fixTypeValid = validateType(state, value.type);
		popPath(state);
		return fixTypeValid;
	}

	case "do": {
		if (!allowCIR) {
			addError(
				state,
				"do expression is only allowed in CIR documents",
				value,
			);
			return false;
		}
		const doExprs = value.exprs;
		if (!validateArray(doExprs)) {
			addError(state, "do expression must have 'exprs' array", value);
			return false;
		}
		for (const elem of doExprs) {
			if (typeof elem === "string") {
				if (!validateId(elem)) {
					addError(state, "do exprs elements must be valid identifiers or expressions", elem);
					return false;
				}
			} else if (validateObject(elem) && "kind" in elem) {
				pushPath(state, "exprs");
				const elemValid = validateExpr(state, elem, allowCIR);
				popPath(state);
				if (!elemValid) return false;
			} else {
				addError(state, "do exprs elements must be valid identifiers or expressions", elem);
				return false;
			}
		}
		return true;
	}

	default:
		addError(state, "Unknown expression kind: " + eKind, value);
		return false;
	}
}

//==============================================================================
// AIR Definition Validation
//==============================================================================

function validateAirDef(
	state: ValidationState,
	value: unknown,
): value is AIRDef {
	if (!validateObject(value)) {
		addError(state, "airDef must be an object", value);
		return false;
	}

	// value is now Record<string, unknown> due to type predicate

	if (!validateId(value.ns)) {
		addError(state, "airDef must have valid 'ns' property", value);
		return false;
	}

	if (!validateId(value.name)) {
		addError(state, "airDef must have valid 'name' property", value);
		return false;
	}

	const defParams = value.params;
	if (!validateArray(defParams)) {
		addError(state, "airDef must have 'params' array", value);
		return false;
	}

	for (const param of defParams) {
		if (!validateId(param)) {
			addError(state, "airDef params must be valid identifiers", param);
			return false;
		}
	}

	if (!value.result) {
		addError(state, "airDef must have 'result' type", value);
		return false;
	}
	pushPath(state, "result");
	const resultValid = validateType(state, value.result);
	popPath(state);

	if (!value.body) {
		addError(state, "airDef must have 'body' expression", value);
		return false;
	}
	pushPath(state, "body");
	const bodyValid = validateExpr(state, value.body, false);
	popPath(state);

	return resultValid && bodyValid;
}

//==============================================================================
// Acyclic Reference Checking
//==============================================================================

function checkAcyclic(
	state: ValidationState,
	nodes: NodeMap,
	startId: string,
	visited: Set<string>,
	path: string[],
	lambdaParams?: Set<string>, // Lambda parameters and let bindings to exclude from ref checking
): void {
	if (visited.has(startId)) {
		// Check if any node in the path is a lambda - if so, this is valid recursion, not a cycle
		// Lambda bodies are lazily evaluated, so a lambda can reference nodes that reference back
		// to the lambda without creating a true evaluation cycle (this enables recursive functions)
		let hasLambda = false;
		for (const nodeId of path) {
			const node = nodes.get(nodeId);
			if (node && "expr" in node && node.expr.kind === "lambda") {
				hasLambda = true;
				break;
			}
		}
		if (hasLambda) {
			// This is recursion through a lambda, which is allowed
			return;
		}
		addError(state, "Reference cycle detected: " + path.join(" -> "));
		return;
	}

	const node = nodes.get(startId);
	if (!node) {
		// Skip error if this is a lambda parameter or let binding (not a node)
		if (lambdaParams?.has(startId)) {
			return;
		}
		addError(state, "Reference to non-existent node: " + startId);
		return;
	}

	visited.add(startId);

	// Skip block nodes - they don't have expressions to analyze
	if (!("expr" in node)) {
		return;
	}

	// If this node is a lambda, collect its parameters for nested checks
	if (node.expr.kind === "lambda") {
		const params = node.expr.params;
		if (Array.isArray(params)) {
			const paramSet = new Set<string>();
			// Start with the passed-in params (outer lambda parameters and let bindings)
			if (lambdaParams) {
				for (const p of lambdaParams) {
					paramSet.add(p);
				}
			}
			// Add this lambda's parameters (string or {name: string} form)
			for (const p of params) {
				if (typeof p === "string") {
					paramSet.add(p);
				} else if (validateObject(p) && typeof p.name === "string") {
					paramSet.add(p.name);
				}
			}
			// Recursively check with the new parameter set
			const result = collectRefsAndLetBindings(node.expr, paramSet);
			// Also include let bindings from this expression
			for (const b of result.letBindings) paramSet.add(b);

			for (const refId of result.refs) {
				const newPath = [...path, refId];
				checkAcyclic(state, nodes, refId, new Set(visited), newPath, paramSet);
			}
			return;
		}
	}

	const result = collectRefsAndLetBindings(node.expr, lambdaParams);
	// Combine lambda params with let bindings for recursive checks
	const combinedParams = new Set<string>(lambdaParams);
	for (const b of result.letBindings) combinedParams.add(b);

	for (const refId of result.refs) {
		// Skip checking lambda parameters and let bindings
		if (result.letBindings.has(refId)) {
			continue;
		}
		if (lambdaParams?.has(refId)) {
			continue;
		}
		const newPath = [...path, refId];
		checkAcyclic(state, nodes, refId, new Set(visited), newPath, combinedParams);
	}
}

type NodeMap = Map<string, { expr?: Record<string, unknown> }>;

interface RefsAndBindings {
	refs: string[];
	letBindings: Set<string>;
}

function collectRefsAndLetBindings(
	expr: Record<string, unknown>,
	params?: Set<string>, // Parameter names and let bindings to exclude from ref collection
	letBindings?: Set<string>, // Let bindings collected so far
): RefsAndBindings {
	const refs: string[] = [];
	const bindings = new Set(letBindings);

	if (expr.kind === "ref") {
		const id = expr.id;
		if (typeof id === "string") {
			// Skip if the reference is a lambda param or let binding
			if (!params?.has(id) && !bindings.has(id)) refs.push(id);
		}
	} else if (expr.kind === "if") {
		const cond = expr.cond,
			then = expr.then,
			els = expr.else;
		// Handle node references (strings) vs inline expressions (objects)
		// Skip if the reference is a lambda param or let binding
		if (typeof cond === "string") {
			if (!params?.has(cond) && !bindings.has(cond)) refs.push(cond);
		} else if (validateObject(cond)) {
			const result = collectRefsAndLetBindings(cond, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof then === "string") {
			if (!params?.has(then) && !bindings.has(then)) refs.push(then);
		} else if (validateObject(then)) {
			const result = collectRefsAndLetBindings(then, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof els === "string") {
			if (!params?.has(els) && !bindings.has(els)) refs.push(els);
		} else if (validateObject(els)) {
			const result = collectRefsAndLetBindings(els, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "let") {
		const value = expr.value,
			body = expr.body;
		// Add let binding name to bindings to exclude it from ref collection
		// The binding name is a variable, not a node reference
		const letName = expr.name;
		if (typeof letName === "string") {
			bindings.add(letName);
		}

		// Handle node references (strings) vs inline expressions (objects)
		// Skip if the reference is a lambda param or let binding
		if (typeof value === "string") {
			if (!params?.has(value) && !bindings.has(value)) refs.push(value);
		} else if (validateObject(value)) {
			const result = collectRefsAndLetBindings(value, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof body === "string") {
			if (!params?.has(body) && !bindings.has(body)) refs.push(body);
		} else if (validateObject(body)) {
			const result = collectRefsAndLetBindings(body, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "call") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					// Skip if this is a parameter name or let binding, not a node reference
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "lambda") {
		const lambdaParams = expr.params;
		if (Array.isArray(lambdaParams)) {
			const paramSet = new Set(params ?? []);
			// Add this lambda's parameters (string or {name: string} form)
			for (const p of lambdaParams) {
				if (typeof p === "string") {
					paramSet.add(p);
				} else if (validateObject(p) && typeof p.name === "string") {
					paramSet.add(p.name);
				}
			}
			// Recursively collect refs from body, excluding lambda parameters
			const body = expr.body;
			if (typeof body === "string") {
				// Skip if the body ref is somehow a param or binding (unlikely but consistent)
				if (!paramSet.has(body) && !bindings.has(body)) refs.push(body);
			} else if (validateObject(body)) {
				// Body is an expression, collect refs from it with parameter awareness
				const result = collectRefsAndLetBindings(body, paramSet, bindings);
				refs.push(...result.refs);
				for (const b of result.letBindings) bindings.add(b);
			}
		}
	} else if (expr.kind === "callExpr") {
		const fn = expr.fn,
			args = expr.args;
		// Skip fn if it's a parameter name or let binding (e.g., calling a lambda parameter)
		if (typeof fn === "string" && !params?.has(fn) && !bindings.has(fn)) {
			refs.push(fn);
		}
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					// Skip if this is a parameter name or let binding
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "fix") {
		const fn = expr.fn;
		if (typeof fn === "string") refs.push(fn);
	} else if (expr.kind === "do") {
		const exprs = expr.exprs;
		if (Array.isArray(exprs)) {
			for (const e of exprs) {
				if (typeof e === "string") {
					if (!params?.has(e) && !bindings.has(e)) refs.push(e);
				} else if (validateObject(e)) {
					const result = collectRefsAndLetBindings(e, params, bindings);
					refs.push(...result.refs);
					for (const b of result.letBindings) bindings.add(b);
				}
			}
		}
	}

	return { refs, letBindings: bindings };
}

//==============================================================================
// Topological Sort
//==============================================================================

/**
 * Topologically sort nodes by their dependency order.
 * Returns sorted nodes if acyclic, or null if a true cycle exists.
 * Lambda bodies are excluded from dependencies (lazy evaluation).
 */
function topologicalSortNodes(
	nodes: { id: string; expr?: Record<string, unknown> }[],
): { id: string; expr?: Record<string, unknown> }[] | null {
	// Build adjacency: for each node, which other nodes does it depend on?
	const nodeIds = new Set(nodes.map(n => n.id));
	const deps = new Map<string, Set<string>>();

	for (const node of nodes) {
		const nodeDeps = new Set<string>();
		if (node.expr) {
			collectNodeDeps(node.expr, nodeDeps, nodeIds);
		}
		deps.set(node.id, nodeDeps);
	}

	// Kahn's algorithm
	const inDegree = new Map<string, number>();
	for (const node of nodes) {
		inDegree.set(node.id, 0);
	}
	for (const [, nodeDeps] of deps) {
		for (const dep of nodeDeps) {
			inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
		}
	}

	const queue: string[] = [];
	for (const [id, degree] of inDegree) {
		if (degree === 0) queue.push(id);
	}

	const sorted: string[] = [];
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) break;
		sorted.push(id);
		const nodeDeps = deps.get(id);
		if (nodeDeps) {
			for (const dep of nodeDeps) {
				const newDegree = (inDegree.get(dep) ?? 1) - 1;
				inDegree.set(dep, newDegree);
				if (newDegree === 0) {
					queue.push(dep);
				}
			}
		}
	}

	if (sorted.length !== nodes.length) {
		return null; // Cycle detected
	}

	// Kahn's gives us nodes with no dependencies first, which is what we want
	const nodeMap = new Map(nodes.map(n => [n.id, n]));
	return sorted.map(id => nodeMap.get(id)).filter((n): n is typeof nodes[number] => n !== undefined);
}

/**
 * Collect node ID dependencies from an expression.
 * Excludes lambda bodies (lazy evaluation) and let binding names.
 */
function collectNodeDeps(
	expr: Record<string, unknown>,
	deps: Set<string>,
	validNodeIds: Set<string>,
	params?: Set<string>,
): void {
	const kind = expr.kind;
	if (typeof kind !== "string") return;

	const addIfNode = (val: unknown) => {
		if (typeof val === "string" && validNodeIds.has(val) && !params?.has(val)) {
			deps.add(val);
		}
	};

	switch (kind) {
	case "ref":
		addIfNode(expr.id);
		break;
	case "call":
		if (Array.isArray(expr.args)) {
			for (const arg of expr.args) {
				if (typeof arg === "string") addIfNode(arg);
				else if (validateObject(arg)) {
					collectNodeDeps(arg, deps, validNodeIds, params);
				}
			}
		}
		break;
	case "if":
		addIfNode(expr.cond);
		addIfNode(expr.then);
		addIfNode(expr.else);
		break;
	case "let": {
		addIfNode(expr.value);
		// Body may reference the let-bound name, which is NOT a node dep
		const letParams = new Set(params ?? []);
		if (typeof expr.name === "string") letParams.add(expr.name);
		if (typeof expr.body === "string" && validNodeIds.has(expr.body) && !letParams.has(expr.body)) {
			deps.add(expr.body);
		}
		break;
	}
	case "callExpr":
		addIfNode(expr.fn);
		if (Array.isArray(expr.args)) {
			for (const arg of expr.args) addIfNode(arg);
		}
		break;
	case "fix":
		addIfNode(expr.fn);
		break;
	case "lambda":
		// Lambda bodies are lazily evaluated - don't add as deps
		break;
	case "do":
		if (Array.isArray(expr.exprs)) {
			for (const e of expr.exprs) {
				if (typeof e === "string") addIfNode(e);
				else if (validateObject(e)) {
					collectNodeDeps(e, deps, validNodeIds, params);
				}
			}
		}
		break;
	}
}

//==============================================================================
// Document Validation
//==============================================================================

export function validateAIR(doc: unknown): ValidationResult<AIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<AIRDocument>(state.errors);
	}

	// doc is now Record<string, unknown> due to type predicate

	// Version check
	if (!validateVersion(doc.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", doc.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (doc.capabilities !== undefined && !validateArray(doc.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", doc.capabilities);
		popPath(state);
	}

	// Function signatures (optional)
	if (doc.functionSigs !== undefined) {
		if (!validateArray(doc.functionSigs)) {
			pushPath(state, "functionSigs");
			addError(state, "functionSigs must be an array", doc.functionSigs);
			popPath(state);
		}
	}

	// AIR defs check
	const airDefsVal = doc.airDefs;
	if (!validateArray(airDefsVal)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", doc.airDefs);
		popPath(state);
	} else {
		for (let i = 0; i < airDefsVal.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, airDefsVal[i]);
			popPath(state);
		}
	}

	// Nodes check
	const airNodesVal = doc.nodes;
	if (!validateArray(airNodesVal)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", doc.nodes);
		popPath(state);
	} else {
		const nodeIds = new Set<string>();

		for (let i = 0; i < airNodesVal.length; i++) {
			const node = airNodesVal[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			// node is now Record<string, unknown>

			// Node ID check
			if (!validateId(node.id)) {
				addError(state, "Node must have valid 'id' property", node.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(node.id)) {
					addError(state, "Duplicate node id: " + node.id, node.id);
				}
				nodeIds.add(node.id);
			}

			// Node expression or blocks check (hybrid support)
			if (validateArray(node.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, node);
			} else if (node.expr) {
				// Expression node
				pushPath(state, "expr");
				validateExpr(state, node.expr, false);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", node);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(doc.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", doc.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodesForResult = doc.nodes;
		if (validateArray(nodesForResult)) {
			const nodeIds = new Set<string>();
			for (const n of nodesForResult) {
				if (validateObject(n) && typeof n.id === "string") {
					nodeIds.add(n.id);
				}
			}
			if (!nodeIds.has(doc.result)) {
				pushPath(state, "result");
				addError(
					state,
					"Result references non-existent node: " + doc.result,
					doc.result,
				);
				popPath(state);
			}
		}
	}

	// Build node map for acyclic checking
	const nodesForAcyclic = doc.nodes;
	if (validateArray(nodesForAcyclic)) {
		const nodeMap: NodeMap = new Map();
		const typedNodes: { id: string; expr?: Record<string, unknown> }[] = [];
		for (const node of nodesForAcyclic) {
			if (validateObject(node) && typeof node.id === "string") {
				if (validateObject(node.expr)) {
					nodeMap.set(node.id, { expr: node.expr });
					typedNodes.push({ id: node.id, expr: node.expr });
				} else {
					// Block nodes (no expr) still need to be in the map
					nodeMap.set(node.id, {});
					typedNodes.push({ id: node.id });
				}
			}
		}

		// Topological sort for forward reference support
		const sorted = topologicalSortNodes(typedNodes);
		if (sorted === null) {
			// True cycle detected - report error
			addError(state, "Reference cycle detected in node dependencies");
		} else {
			// Check each node for cycles (using sorted order)
			for (const node of sorted) {
				if (typeof node.id === "string") {
					checkAcyclic(state, nodeMap, node.id, new Set(), [node.id]);
				}
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<AIRDocument>(state.errors);
	}

	assertAIRDocument(doc);
	return validResult(doc);
}

export function validateCIR(doc: unknown): ValidationResult<CIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<CIRDocument>(state.errors);
	}

	// doc is now Record<string, unknown> due to type predicate

	// Version check
	if (!validateVersion(doc.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", doc.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (doc.capabilities !== undefined && !validateArray(doc.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", doc.capabilities);
		popPath(state);
	}

	// AIR defs check (same for CIR)
	const cirAirDefs = doc.airDefs;
	if (!validateArray(cirAirDefs)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", doc.airDefs);
		popPath(state);
	} else {
		for (let i = 0; i < cirAirDefs.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, cirAirDefs[i]);
			popPath(state);
		}
	}

	// Nodes check (allow CIR expressions)
	const cirNodesVal = doc.nodes;
	if (!validateArray(cirNodesVal)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", doc.nodes);
		popPath(state);
	} else {
		const nodeIds = new Set<string>();

		for (let i = 0; i < cirNodesVal.length; i++) {
			const node = cirNodesVal[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			// node is now Record<string, unknown>

			// Node ID check
			if (!validateId(node.id)) {
				addError(state, "Node must have valid 'id' property", node.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(node.id)) {
					addError(state, "Duplicate node id: " + node.id, node.id);
				}
				nodeIds.add(node.id);
			}

			// Node expression or blocks check (hybrid support, allow CIR)
			if (validateArray(node.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, node);
			} else if (node.expr) {
				// Expression node
				pushPath(state, "expr");
				validateExpr(state, node.expr, true);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", node);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(doc.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", doc.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodeIds = new Set<string>();
		const nodesForResult = doc.nodes;
		if (validateArray(nodesForResult)) {
			for (const n of nodesForResult) {
				if (validateObject(n) && typeof n.id === "string") {
					nodeIds.add(n.id);
				}
			}
		}
		if (!nodeIds.has(doc.result)) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + doc.result,
				doc.result,
			);
			popPath(state);
		}
	}

	// Build node map for acyclic checking and collect lambda parameters and let bindings
	const cirNodesForAcyclic = doc.nodes;
	if (validateArray(cirNodesForAcyclic)) {
		const nodeMap: NodeMap = new Map();
		const allParamsAndBindings = new Set<string>(); // Lambda parameters AND let binding names
		const typedNodes: { id: string; expr?: Record<string, unknown> }[] = [];

		// Helper to recursively collect lambda params and let bindings from an expression
		const collectParamsAndBindings = (expr: Record<string, unknown>): void => {
			if (expr.kind === "lambda") {
				const params = expr.params;
				if (Array.isArray(params)) {
					for (const p of params) {
						if (typeof p === "string") {
							allParamsAndBindings.add(p);
						} else if (validateObject(p) && typeof p.name === "string") {
							allParamsAndBindings.add(p.name);
						}
					}
				}
				// Recurse into body if it's an inline expression
				if (validateObject(expr.body)) {
					collectParamsAndBindings(expr.body);
				}
			} else if (expr.kind === "let") {
				// Collect let binding name
				if (typeof expr.name === "string") {
					allParamsAndBindings.add(expr.name);
				}
				// Recurse into value and body
				if (validateObject(expr.value)) {
					collectParamsAndBindings(expr.value);
				}
				if (validateObject(expr.body)) {
					collectParamsAndBindings(expr.body);
				}
			} else if (expr.kind === "if") {
				// Recurse into cond, then, else
				if (validateObject(expr.cond)) {
					collectParamsAndBindings(expr.cond);
				}
				if (validateObject(expr.then)) {
					collectParamsAndBindings(expr.then);
				}
				if (validateObject(expr.else)) {
					collectParamsAndBindings(expr.else);
				}
			}
		};

		for (const node of cirNodesForAcyclic) {
			if (validateObject(node) && typeof node.id === "string") {
				if (validateObject(node.expr)) {
					nodeMap.set(node.id, { expr: node.expr });
					typedNodes.push({ id: node.id, expr: node.expr });
					// Collect lambda parameters and let bindings from this node's expression
					collectParamsAndBindings(node.expr);
				} else {
					// Block nodes (no expr) still need to be in the map
					nodeMap.set(node.id, {});
					typedNodes.push({ id: node.id });
				}
			}
		}

		// Topological sort for forward reference support
		const sorted = topologicalSortNodes(typedNodes);
		if (sorted === null) {
			// True cycle detected - report error
			addError(state, "Reference cycle detected in node dependencies");
		} else {
			// Check each node for cycles (using sorted order)
			for (const node of sorted) {
				if (typeof node.id === "string") {
					checkAcyclic(state, nodeMap, node.id, new Set(), [node.id], allParamsAndBindings);
				}
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<CIRDocument>(state.errors);
	}

	assertCIRDocument(doc);
	return validResult(doc);
}

//==============================================================================
// EIR Validation
//==============================================================================

/**
 * Validate an EIR document.
 * EIR extends CIR with sequencing, mutation, loops, and effects.
 */
export function validateEIR(doc: unknown): ValidationResult<import("./types.js").EIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Validate basic document structure (same as AIR/CIR)
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult(state.errors);
	}

	// doc is now Record<string, unknown> due to type predicate

	// Validate version
	pushPath(state, "version");
	const eirVersion = doc.version;
	if (!validateString(eirVersion) || !validateVersion(eirVersion)) {
		addError(state, "Document must have valid semantic version", doc.version);
	}
	popPath(state);

	// Validate capabilities (optional)
	if (doc.capabilities !== undefined) {
		pushPath(state, "capabilities");
		if (!validateArray(doc.capabilities)) {
			addError(state, "capabilities must be an array", doc.capabilities);
		}
		popPath(state);
	}

	// Validate airDefs
	pushPath(state, "airDefs");
	if (!validateArray(doc.airDefs)) {
		addError(state, "airDefs must be an array", doc.airDefs);
	}
	popPath(state);

	// Validate nodes and track node IDs
	const nodeIds = new Set<string>();
	const eirNodesVal = doc.nodes;
	if (validateArray(eirNodesVal)) {
		pushPath(state, "nodes");
		for (let i = 0; i < eirNodesVal.length; i++) {
			const node = eirNodesVal[i];
			pushPath(state, "[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				popPath(state);
				continue;
			}

			// node is now Record<string, unknown>

			// Validate node id
			pushPath(state, "id");
			const nodeId = node.id;
			if (!validateId(nodeId)) {
				addError(state, "Node must have valid id", node.id);
			} else {
				if (nodeIds.has(nodeId)) {
					addError(state, "Duplicate node id: " + nodeId, nodeId);
				}
				nodeIds.add(nodeId);
			}
			popPath(state);

			// Validate expr or blocks (hybrid support, allow both CIR and EIR expressions)
			if (validateArray(node.blocks)) {
				// Block node - validate CFG structure
				validateHybridBlockNode(state, node);
			} else if (validateObject(node.expr)) {
				// Expression node
				pushPath(state, "expr");
				validateEirExpr(state, node.expr);
				popPath(state);
			} else {
				addError(state, "Node must have either 'blocks' array or 'expr' property", node);
			}

			popPath(state);
		}
		popPath(state);
	} else {
		addError(state, "nodes must be an array", doc.nodes);
	}

	// Validate result reference
	pushPath(state, "result");
	if (!validateId(doc.result)) {
		addError(state, "Result must be a valid identifier", doc.result);
	} else {
		if (!nodeIds.has(doc.result)) {
			addError(state, "Result references non-existent node: " + doc.result, doc.result);
		}
	}
	popPath(state);

	// Validate node references in EIR expressions
	const eirNodesForRefs = doc.nodes;
	if (validateArray(eirNodesForRefs)) {
		for (const node of eirNodesForRefs) {
			if (validateObject(node)) {
				if (node.expr && validateObject(node.expr)) {
					validateEirNodeReferences(state, node.expr, nodeIds);
				}
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	assertEIRDocument(doc);
	return validResult(doc);
}

/**
 * Validate EIR-specific expressions
 */
function validateEirExpr(state: ValidationState, expr: Record<string, unknown>): void {
	const eirKind = expr.kind;
	if (!validateString(eirKind)) {
		addError(state, "Expression must have 'kind' property", expr);
		return;
	}

	switch (eirKind) {
	case "seq":
		if (typeof expr.first === "string") {
			if (!validateId(expr.first)) {
				addError(state, "seq expression must have valid 'first' identifier", expr);
			}
		} else if (validateObject(expr.first)) {
			validateEirExpr(state, expr.first);
		}
		if (typeof expr.then === "string") {
			if (!validateId(expr.then)) {
				addError(state, "seq expression must have valid 'then' identifier", expr);
			}
		} else if (validateObject(expr.then)) {
			validateEirExpr(state, expr.then);
		}
		break;

	case "assign":
		if (!validateId(expr.target)) {
			addError(state, "assign expression must have valid 'target' identifier", expr);
		}
		if (typeof expr.value === "string") {
			if (!validateId(expr.value)) {
				addError(state, "assign value must be valid identifier or expression", expr);
			}
		} else if (validateObject(expr.value)) {
			validateEirExpr(state, expr.value);
		}
		break;

	case "while":
		if (expr.cond === undefined) {
			addError(state, "while expression must have 'cond' property", expr);
		} else if (typeof expr.cond === "string") {
			if (!validateId(expr.cond)) {
				addError(state, "while expression must have valid 'cond' identifier", expr);
			}
		} else if (validateObject(expr.cond)) {
			validateEirExpr(state, expr.cond);
		}
		if (expr.body === undefined) {
			addError(state, "while expression must have 'body' property", expr);
		} else if (typeof expr.body === "string") {
			if (!validateId(expr.body)) {
				addError(state, "while expression must have valid 'body' identifier", expr);
			}
		} else if (validateObject(expr.body)) {
			validateEirExpr(state, expr.body);
		}
		break;

	case "for":
		if (!validateId(expr.var)) {
			addError(state, "for expression must have valid 'var' identifier", expr);
		}
		if (typeof expr.init === "string") {
			if (!validateId(expr.init)) {
				addError(state, "for expression must have valid 'init' identifier", expr);
			}
		} else if (validateObject(expr.init)) {
			validateEirExpr(state, expr.init);
		}
		if (typeof expr.cond === "string") {
			if (!validateId(expr.cond)) {
				addError(state, "for expression must have valid 'cond' identifier", expr);
			}
		} else if (validateObject(expr.cond)) {
			validateEirExpr(state, expr.cond);
		}
		if (typeof expr.update === "string") {
			if (!validateId(expr.update)) {
				addError(state, "for expression must have valid 'update' identifier", expr);
			}
		} else if (validateObject(expr.update)) {
			validateEirExpr(state, expr.update);
		}
		if (typeof expr.body === "string") {
			if (!validateId(expr.body)) {
				addError(state, "for expression must have valid 'body' identifier", expr);
			}
		} else if (validateObject(expr.body)) {
			validateEirExpr(state, expr.body);
		}
		break;

	case "iter":
		if (!validateId(expr.var)) {
			addError(state, "iter expression must have valid 'var' identifier", expr);
		}
		if (typeof expr.iter === "string") {
			if (!validateId(expr.iter)) {
				addError(state, "iter expression must have valid 'iter' identifier", expr);
			}
		} else if (validateObject(expr.iter)) {
			validateEirExpr(state, expr.iter);
		}
		if (typeof expr.body === "string") {
			if (!validateId(expr.body)) {
				addError(state, "iter expression must have valid 'body' identifier", expr);
			}
		} else if (validateObject(expr.body)) {
			validateEirExpr(state, expr.body);
		}
		break;

	case "effect":
		if (!validateString(expr.op)) {
			addError(state, "effect expression must have valid 'op' string", expr);
		}
		{
			const effectArgs = expr.args;
			if (!validateArray(effectArgs)) {
				addError(state, "effect expression must have 'args' array", expr);
			} else {
				for (const arg of effectArgs) {
					if (typeof arg === "string") {
						if (!validateId(arg)) {
							addError(state, "effect args must be valid identifiers or expressions", arg);
						}
					} else if (validateObject(arg)) {
						validateEirExpr(state, arg);
					}
				}
			}
		}
		break;

	case "try":
		if (typeof expr.tryBody === "string") {
			if (!validateId(expr.tryBody)) {
				addError(state, "try expression must have valid 'tryBody' identifier", expr);
			}
		} else if (validateObject(expr.tryBody)) {
			validateEirExpr(state, expr.tryBody);
		}
		if (!validateId(expr.catchParam)) {
			addError(state, "try expression must have valid 'catchParam' identifier", expr);
		}
		if (typeof expr.catchBody === "string") {
			if (!validateId(expr.catchBody)) {
				addError(state, "try expression must have valid 'catchBody' identifier", expr);
			}
		} else if (validateObject(expr.catchBody)) {
			validateEirExpr(state, expr.catchBody);
		}
		if (expr.fallback !== undefined) {
			if (typeof expr.fallback === "string") {
				if (!validateId(expr.fallback)) {
					addError(state, "try expression fallback must be a valid identifier", expr);
				}
			} else if (validateObject(expr.fallback)) {
				validateEirExpr(state, expr.fallback);
			}
		}
		break;

	case "refCell":
		if (!validateId(expr.target)) {
			addError(state, "refCell expression must have valid 'target' identifier", expr);
		}
		break;

	case "deref":
		if (!validateId(expr.target)) {
			addError(state, "deref expression must have valid 'target' identifier", expr);
		}
		break;

		// CIR and AIR expressions are already validated by validateCIR
	case "lit":
	case "ref":
	case "var":
	case "call":
	case "if":
	case "let":
	case "airRef":
	case "predicate":
	case "lambda":
	case "callExpr":
	case "fix":
	case "do":
		// Already validated
		break;

	default:
		addError(state, "Unknown expression kind in EIR: " + eirKind, expr);
		break;
	}
}

/**
 * Validate node references in EIR expressions.
 */
function validateEirNodeReferences(
	state: ValidationState,
	expr: Record<string, unknown>,
	nodeIds: Set<string>,
): void {
	const eirRefKind = expr.kind;
	if (!validateString(eirRefKind)) {
		return;
	}

	// Helper to check a node reference
	const checkRef = (ref: unknown, name: string) => {
		if (validateId(ref)) {
			if (!nodeIds.has(ref)) {
				addError(state, name + " references non-existent node: " + ref, ref);
			}
		}
	};

	switch (eirRefKind) {
	case "seq":
		if (typeof expr.first === "string") checkRef(expr.first, "seq.first");
		if (typeof expr.then === "string") checkRef(expr.then, "seq.then");
		break;

	case "assign":
		if (typeof expr.value === "string") checkRef(expr.value, "assign.value");
		break;

	case "while":
		if (typeof expr.cond === "string") checkRef(expr.cond, "while.cond");
		if (typeof expr.body === "string") checkRef(expr.body, "while.body");
		break;

	case "for":
		if (typeof expr.init === "string") checkRef(expr.init, "for.init");
		if (typeof expr.cond === "string") checkRef(expr.cond, "for.cond");
		if (typeof expr.update === "string") checkRef(expr.update, "for.update");
		if (typeof expr.body === "string") checkRef(expr.body, "for.body");
		break;

	case "iter":
		if (typeof expr.iter === "string") checkRef(expr.iter, "iter.iter");
		if (typeof expr.body === "string") checkRef(expr.body, "iter.body");
		break;

	case "effect": {
		const effectRefArgs = expr.args;
		if (validateArray(effectRefArgs)) {
			for (let i = 0; i < effectRefArgs.length; i++) {
				const arg = effectRefArgs[i];
				if (typeof arg === "string") {
					checkRef(arg, "effect.args[" + String(i) + "]");
				}
			}
		}
		break;
	}

	case "try":
		if (typeof expr.tryBody === "string") checkRef(expr.tryBody, "try.tryBody");
		if (typeof expr.catchBody === "string") checkRef(expr.catchBody, "try.catchBody");
		if (expr.fallback !== undefined && typeof expr.fallback === "string") {
			checkRef(expr.fallback, "try.fallback");
		}
		break;

	case "refCell":
	case "deref":
	case "lit":
	case "ref":
	case "var":
	case "call":
	case "if":
	case "let":
	case "airRef":
	case "predicate":
	case "lambda":
	case "callExpr":
	case "fix":
		// These don't have node references that need validation
		break;

	default:
		break;
	}
}

//==============================================================================
// LIR Validation
//==============================================================================

/**
 * Validate an LIR document.
 * LIR uses nodes/result structure where nodes contain CFG blocks.
 */
export function validateLIR(doc: unknown): ValidationResult<import("./types.js").LIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "LIR Document must be an object", doc);
		return invalidResult(state.errors);
	}

	// doc is now Record<string, unknown> due to type predicate

	// Version check
	if (!validateVersion(doc.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", doc.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (doc.capabilities !== undefined && !validateArray(doc.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", doc.capabilities);
		popPath(state);
	}

	// Nodes check
	const lirNodesVal = doc.nodes;
	if (!validateArray(lirNodesVal)) {
		pushPath(state, "nodes");
		addError(state, "LIR Document must have 'nodes' array", doc.nodes);
		popPath(state);
		return invalidResult(state.errors);
	}

	const lirNodeIds = new Set<string>();

	// Validate each node
	for (let i = 0; i < lirNodesVal.length; i++) {
		const node = lirNodesVal[i];
		pushPath(state, "nodes[" + String(i) + "]");

		if (!validateObject(node)) {
			addError(state, "Node must be an object", node);
			popPath(state);
			continue;
		}

		// node is now Record<string, unknown>

		// Node ID check
		if (!validateId(node.id)) {
			addError(state, "Node must have valid 'id' property", node.id);
		} else {
			if (lirNodeIds.has(node.id)) {
				addError(state, "Duplicate node id: " + node.id, node.id);
			}
			lirNodeIds.add(node.id);
		}

		// Check if this is a block node (has blocks/entry) or expression node (has expr)
		if (validateArray(node.blocks)) {
			// Block node - validate CFG structure
			validateLirBlockNode(state, node);
		} else if (node.expr !== undefined) {
			// Expression node - validate expression
			pushPath(state, "expr");
			// Basic expression validation (LIR typically uses block nodes)
			if (!validateObject(node.expr)) {
				addError(state, "Expression must be an object", node.expr);
			}
			popPath(state);
		} else {
			addError(state, "Node must have either 'blocks' array or 'expr' property", node);
		}

		popPath(state);
	}

	// Result check
	if (!validateId(doc.result)) {
		pushPath(state, "result");
		addError(state, "LIR Document must have valid 'result' reference", doc.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		if (!lirNodeIds.has(doc.result)) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + doc.result,
				doc.result,
			);
			popPath(state);
		}
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	assertLIRDocument(doc);
	return validResult(doc);
}

/**
 * Validate a hybrid block node for AIR/CIR/EIR documents.
 * This validates the CFG structure (blocks/entry) that can be used
 * as an alternative to expressions in hybrid documents.
 */
function validateHybridBlockNode(state: ValidationState, n: Record<string, unknown>): void {
	const blocks = n.blocks;
	if (!validateArray(blocks)) return; // caller already checked
	const blockIds = new Set<string>();

	// Validate each block
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		pushPath(state, "blocks[" + String(i) + "]");

		if (!validateObject(block)) {
			addError(state, "Block must be an object", block);
			popPath(state);
			continue;
		}

		// block is now Record<string, unknown>

		// Block ID check
		if (!validateId(block.id)) {
			addError(state, "Block must have valid 'id' property", block.id);
		} else {
			if (blockIds.has(block.id)) {
				addError(state, "Duplicate block id: " + block.id, block.id);
			}
			blockIds.add(block.id);
		}

		// Instructions check
		const hybridInstructions = block.instructions;
		if (!validateArray(hybridInstructions)) {
			addError(state, "Block must have 'instructions' array", block.instructions);
		} else {
			for (let j = 0; j < hybridInstructions.length; j++) {
				pushPath(state, "instructions[" + String(j) + "]");
				validateHybridInstruction(state, hybridInstructions[j]);
				popPath(state);
			}
		}

		// Terminator check
		if (!block.terminator) {
			addError(state, "Block must have 'terminator' property", block);
		} else {
			pushPath(state, "terminator");
			validateLirTerminator(state, block.terminator);
			popPath(state);
		}

		popPath(state);
	}

	// Entry check
	if (!validateId(n.entry)) {
		pushPath(state, "entry");
		addError(state, "Block node must have valid 'entry' reference", n.entry);
		popPath(state);
	} else {
		if (!blockIds.has(n.entry)) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + n.entry,
				n.entry,
			);
			popPath(state);
		}
	}
}

/**
 * Validate an instruction in a hybrid block node.
 * Allows: assign, op, phi (pure instructions for AIR/CIR/EIR hybrid nodes)
 */
function validateHybridInstruction(state: ValidationState, ins: unknown): void {
	if (!validateObject(ins)) {
		addError(state, "Instruction must be an object", ins);
		return;
	}

	// ins is now Record<string, unknown> due to type predicate
	const hybridInsKind = ins.kind;
	if (!validateString(hybridInsKind)) {
		addError(state, "Instruction must have 'kind' property", ins);
		return;
	}

	switch (hybridInsKind) {
	case "assign":
		if (!validateId(ins.target)) {
			addError(state, "assign instruction must have valid 'target'", ins.target);
		}
		if (!ins.value) {
			addError(state, "assign instruction must have 'value' property", ins);
		}
		break;

	case "op":
		if (!validateId(ins.target)) {
			addError(state, "op instruction must have valid 'target'", ins.target);
		}
		if (!validateId(ins.ns)) {
			addError(state, "op instruction must have valid 'ns'", ins.ns);
		}
		if (!validateId(ins.name)) {
			addError(state, "op instruction must have valid 'name'", ins.name);
		}
		if (!validateArray(ins.args)) {
			addError(state, "op instruction must have 'args' array", ins.args);
		}
		break;

	case "phi":
		if (!validateId(ins.target)) {
			addError(state, "phi instruction must have valid 'target'", ins.target);
		}
		if (!validateArray(ins.sources)) {
			addError(state, "phi instruction must have 'sources' array", ins.sources);
		}
		break;

	default:
		addError(state, "Unknown or disallowed instruction kind in hybrid block: " + hybridInsKind, ins);
		break;
	}
}

/**
 * Validate an LIR block node (a node with blocks/entry).
 */
function validateLirBlockNode(state: ValidationState, n: Record<string, unknown>): void {
	const blocks = n.blocks;
	if (!validateArray(blocks)) return; // caller already checked
	const blockIds = new Set<string>();

	// Validate each block
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		pushPath(state, "blocks[" + String(i) + "]");

		if (!validateObject(block)) {
			addError(state, "Block must be an object", block);
			popPath(state);
			continue;
		}

		// block is now Record<string, unknown>

		// Block ID check
		if (!validateId(block.id)) {
			addError(state, "Block must have valid 'id' property", block.id);
		} else {
			// Check for duplicate IDs
			if (blockIds.has(block.id)) {
				addError(state, "Duplicate block id: " + block.id, block.id);
			}
			blockIds.add(block.id);
		}

		// Instructions check
		const lirBlockInstructions = block.instructions;
		if (!validateArray(lirBlockInstructions)) {
			addError(state, "Block must have 'instructions' array", block.instructions);
		} else {
			for (let j = 0; j < lirBlockInstructions.length; j++) {
				pushPath(state, "instructions[" + String(j) + "]");
				validateLirInstruction(state, lirBlockInstructions[j]);
				popPath(state);
			}
		}

		// Terminator check
		if (!block.terminator) {
			addError(state, "Block must have 'terminator' property", block);
		} else {
			pushPath(state, "terminator");
			validateLirTerminator(state, block.terminator);
			popPath(state);
		}

		popPath(state);
	}

	// Entry check
	if (!validateId(n.entry)) {
		pushPath(state, "entry");
		addError(state, "Block node must have valid 'entry' reference", n.entry);
		popPath(state);
	} else {
		// Check that entry references a valid block
		if (!blockIds.has(n.entry)) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + n.entry,
				n.entry,
			);
			popPath(state);
		}
	}

	// Validate CFG structure
	const cfgBlocks: Record<string, unknown>[] = [];
	for (const b of blocks) {
		if (validateObject(b)) {
			cfgBlocks.push(b);
		}
	}
	validateCFG(state, cfgBlocks);
}

/**
 * Validate an LIR instruction
 */
function validateLirInstruction(state: ValidationState, ins: unknown): void {
	if (!validateObject(ins)) {
		addError(state, "Instruction must be an object", ins);
		return;
	}

	// ins is now Record<string, unknown>
	const lirInsKind = ins.kind;
	if (!validateString(lirInsKind)) {
		addError(state, "Instruction must have 'kind' property", ins);
		return;
	}

	switch (lirInsKind) {
	case "assign":
		if (!validateId(ins.target)) {
			addError(state, "assign instruction must have valid 'target'", ins.target);
		}
		if (!ins.value) {
			addError(state, "assign instruction must have 'value' property", ins);
		}
		break;

	case "call":
		if (!validateId(ins.target)) {
			addError(state, "call instruction must have valid 'target'", ins.target);
		}
		if (!validateId(ins.callee)) {
			addError(state, "call instruction must have valid 'callee'", ins.callee);
		}
		if (!validateArray(ins.args)) {
			addError(state, "call instruction must have 'args' array", ins.args);
		}
		break;

	case "op":
		if (!validateId(ins.target)) {
			addError(state, "op instruction must have valid 'target'", ins.target);
		}
		if (!validateId(ins.ns)) {
			addError(state, "op instruction must have valid 'ns'", ins.ns);
		}
		if (!validateId(ins.name)) {
			addError(state, "op instruction must have valid 'name'", ins.name);
		}
		if (!validateArray(ins.args)) {
			addError(state, "op instruction must have 'args' array", ins.args);
		}
		break;

	case "phi":
		if (!validateId(ins.target)) {
			addError(state, "phi instruction must have valid 'target'", ins.target);
		}
		if (!validateArray(ins.sources)) {
			addError(state, "phi instruction must have 'sources' array", ins.sources);
		}
		break;

	case "effect":
		if (!validateString(ins.op)) {
			addError(state, "effect instruction must have valid 'op'", ins.op);
		}
		if (!validateArray(ins.args)) {
			addError(state, "effect instruction must have 'args' array", ins.args);
		}
		break;

	case "assignRef":
		if (!validateId(ins.target)) {
			addError(state, "assignRef instruction must have valid 'target'", ins.target);
		}
		if (!validateId(ins.value)) {
			addError(state, "assignRef instruction must have 'value'", ins.value);
		}
		break;

	default:
		addError(state, "Unknown instruction kind: " + lirInsKind, ins);
		break;
	}
}

/**
 * Validate an LIR terminator
 */
function validateLirTerminator(state: ValidationState, term: unknown): void {
	if (!validateObject(term)) {
		addError(state, "Terminator must be an object", term);
		return;
	}

	// term is now Record<string, unknown> due to type predicate
	const termKind = term.kind;
	if (!validateString(termKind)) {
		addError(state, "Terminator must have 'kind' property", term);
		return;
	}

	switch (termKind) {
	case "jump":
		if (!validateId(term.to)) {
			addError(state, "jump terminator must have valid 'to' target", term.to);
		}
		break;

	case "branch":
		if (!validateId(term.cond)) {
			addError(state, "branch terminator must have valid 'cond'", term.cond);
		}
		if (!validateId(term.then)) {
			addError(state, "branch terminator must have valid 'then' target", term.then);
		}
		if (!validateId(term.else)) {
			addError(state, "branch terminator must have valid 'else' target", term.else);
		}
		break;

	case "return":
		// value is optional
		break;

	case "exit":
		// code is optional
		break;

	case "fork":
		if (!Array.isArray(term.branches) || term.branches.length < 1) {
			addError(state, "fork terminator must have at least 1 branch", term.branches);
		} else {
			for (const branch of term.branches) {
				if (!validateObject(branch)) {
					addError(state, "fork branch must be an object", branch);
				} else {
					if (!validateId(branch.block)) {
						addError(state, "fork branch must have valid 'block' identifier", branch);
					}
					if (!validateId(branch.taskId)) {
						addError(state, "fork branch must have valid 'taskId' identifier", branch);
					}
				}
			}
		}
		if (!validateId(term.continuation)) {
			addError(state, "fork terminator must have valid 'continuation' identifier", term.continuation);
		}
		break;

	default:
		addError(state, "Unknown terminator kind: " + termKind, term);
		break;
	}
}

/**
 * Validate CFG structure
 * Check that all jump/branch targets reference valid blocks
 */
function validateCFG(
	state: ValidationState,
	blocks: Record<string, unknown>[],
): void {
	const blockIds = new Set<string>();
	for (const block of blocks) {
		if (typeof block.id === "string") {
			blockIds.add(block.id);
		}
	}

	for (const block of blocks) {
		if (block.terminator && validateObject(block.terminator)) {
			const term = block.terminator;
			const termCfgKind = term.kind;

			if (termCfgKind === "jump") {
				const to = term.to;
				if (typeof to === "string" && !blockIds.has(to)) {
					addError(
						state,
						"Jump terminator references non-existent block: " + to,
						to,
					);
				}
			} else if (termCfgKind === "branch") {
				const thenTarget = term.then;
				const elseTarget = term.else;
				if (typeof thenTarget === "string" && !blockIds.has(thenTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + thenTarget,
						thenTarget,
					);
				}
				if (typeof elseTarget === "string" && !blockIds.has(elseTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + elseTarget,
						elseTarget,
					);
				}
			}
		}

		// Check phi sources reference valid blocks
		const cfgInstructions = block.instructions;
		if (validateArray(cfgInstructions)) {
			for (const ins of cfgInstructions) {
				if (validateObject(ins)) {
					const insSources = ins.sources;
					if (ins.kind === "phi" && validateArray(insSources)) {
						for (const source of insSources) {
							if (validateObject(source)) {
								const sourceBlock = source.block;
								if (
									typeof sourceBlock === "string" &&
									!blockIds.has(sourceBlock)
								) {
									addError(
										state,
										"Phi source references non-existent block: " +
											sourceBlock,
										sourceBlock,
									);
								}
							}
						}
					}
				}
			}
		}
	}
}

//==============================================================================
// PIR Validation
//==============================================================================

export function validatePIR(doc: unknown): ValidationResult<import("./types.js").PIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<import("./types.js").PIRDocument>(state.errors);
	}

	// doc is now Record<string, unknown> due to type predicate

	// Check version (PIR uses version 2.x.x)
	pushPath(state, "version");
	if (doc.version !== undefined && typeof doc.version !== "string") {
		addError(state, "version must be a string", doc.version);
	} else if (typeof doc.version === "string" && !(/^2\.\d+\.\d+$/.exec(doc.version))) {
		addError(state, "PIR version must match 2.x.x format", doc.version);
	}
	popPath(state);

	// Check airDefs (optional, should be array if present)
	if (doc.airDefs !== undefined && !Array.isArray(doc.airDefs)) {
		addError(state, "airDefs must be an array", doc.airDefs);
	}

	// Check functionSigs (optional, should be array if present)
	if (doc.functionSigs !== undefined && !Array.isArray(doc.functionSigs)) {
		addError(state, "functionSigs must be an array", doc.functionSigs);
	}

	// Check capabilities (optional, should be array if present)
	if (doc.capabilities !== undefined) {
		if (!Array.isArray(doc.capabilities)) {
			addError(state, "capabilities must be an array", doc.capabilities);
		} else {
			const validCapabilities = ["async", "parallel", "channels", "hybrid"];
			for (const cap of doc.capabilities) {
				if (typeof cap !== "string" || !validCapabilities.includes(cap)) {
					addError(state, `Invalid capability: ${cap}`, cap);
				}
			}
		}
	}

	// Check nodes (required)
	if (!Array.isArray(doc.nodes)) {
		addError(state, "nodes must be an array", doc.nodes);
	} else {
		for (let i = 0; i < doc.nodes.length; i++) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const node = doc.nodes[i];
			pushPath(state, `nodes[${i}]`);
			validatePIRNode(node, state);
			popPath(state);
		}
	}

	// Check result (required)
	if (typeof doc.result !== "string") {
		addError(state, "result must be a string (node ID)", doc.result);
	}

	if (state.errors.length > 0) {
		return invalidResult<import("./types.js").PIRDocument>(state.errors);
	}

	assertPIRDocument(doc);
	return validResult(doc);
}

/**
 * Validate a PIR node (expression or block-based)
 */
function validatePIRNode(node: unknown, state: ValidationState): void {
	if (!validateObject(node)) {
		addError(state, "Node must be an object", node);
		return;
	}

	// node is now Record<string, unknown> due to type predicate

	// Check id (required)
	if (typeof node.id !== "string" || !(/^[A-Za-z][A-Za-z0-9_-]*$/.exec(node.id))) {
		addError(state, "id must be a valid identifier", node.id);
	}

	// Check type (optional)
	if (node.type !== undefined) {
		// Type validation would go here
	}

	// Check for expr OR (blocks + entry)
	const hasExpr = node.expr !== undefined;
	const hasBlocks = node.blocks !== undefined;
	const hasEntry = node.entry !== undefined;

	if (hasExpr && (hasBlocks || hasEntry)) {
		addError(state, "Node cannot have both expr and blocks", node);
	} else if (!hasExpr && (!hasBlocks || !hasEntry)) {
		addError(state, "Node must have either expr or (blocks + entry)", node);
	}

	if (hasExpr) {
		validatePIRExpr(node.expr, state);
	}

	if (hasBlocks) {
		if (!Array.isArray(node.blocks)) {
			addError(state, "blocks must be an array", node.blocks);
		} else {
			for (let i = 0; i < node.blocks.length; i++) {
				pushPath(state, `blocks[${i}]`);
				validatePIRBlock(node.blocks[i], state);
				popPath(state);
			}
		}
	}

	if (hasEntry && typeof node.entry !== "string") {
		addError(state, "entry must be a string (block ID)", node.entry);
	}
}

/**
 * Validate a PIR expression
 */
function validatePIRExpr(expr: unknown, state: ValidationState): void {
	if (!validateObject(expr)) {
		addError(state, "Expression must be an object", expr);
		return;
	}

	const kind = expr.kind;

	if (typeof kind !== "string") {
		addError(state, "Expression must have a 'kind' field", expr);
		return;
	}

	// PIR-specific expression kinds
	const pirKinds = ["par", "spawn", "await", "channel", "send", "recv", "select", "race"];
	// EIR expression kinds (PIR extends EIR)
	const eirKinds = ["lit", "var", "call", "if", "let", "lambda", "callExpr", "fix", "do", "seq", "assign", "while", "for", "iter", "effect", "refCell", "try"];

	const validKinds = [...pirKinds, ...eirKinds];
	if (!validKinds.includes(kind)) {
		addError(state, `Unknown expression kind in PIR: ${kind}`, kind);
		return;
	}

	// Validate PIR-specific expressions
	switch (kind) {
	case "par":
		if (!Array.isArray(expr.branches) || expr.branches.length < 2) {
			addError(state, "par expression must have at least 2 branches", expr.branches);
		}
		break;
	case "spawn":
		if (typeof expr.task !== "string") {
			addError(state, "spawn expression must have a task (node ID)", expr.task);
		}
		break;
	case "await":
		if (typeof expr.future !== "string") {
			addError(state, "await expression must have a future (node ID)", expr.future);
		}
		break;
	case "channel":
		if (typeof expr.channelType !== "string") {
			addError(state, "channel expression must have a channelType", expr.channelType);
		}
		break;
	case "send":
		if (typeof expr.channel !== "string" || typeof expr.value !== "string") {
			addError(state, "send expression must have channel and value (node IDs)", { channel: expr.channel, value: expr.value });
		}
		break;
	case "recv":
		if (typeof expr.channel !== "string") {
			addError(state, "recv expression must have a channel (node ID)", expr.channel);
		}
		break;
	case "select":
		if (!Array.isArray(expr.futures) || expr.futures.length < 1) {
			addError(state, "select expression must have at least 1 future", expr.futures);
		}
		break;
	case "race":
		if (!Array.isArray(expr.tasks) || expr.tasks.length < 2) {
			addError(state, "race expression must have at least 2 tasks", expr.tasks);
		}
		break;
	case "try":
		if (typeof expr.tryBody === "string") {
			if (!validateId(expr.tryBody)) {
				addError(state, "try expression must have valid 'tryBody' identifier", expr);
			}
		} else {
			validatePIRExpr(expr.tryBody, state);
		}
		if (!validateId(expr.catchParam)) {
			addError(state, "try expression must have valid 'catchParam' identifier", expr);
		}
		if (typeof expr.catchBody === "string") {
			if (!validateId(expr.catchBody)) {
				addError(state, "try expression must have valid 'catchBody' identifier", expr);
			}
		} else {
			validatePIRExpr(expr.catchBody, state);
		}
		if (expr.fallback !== undefined) {
			if (typeof expr.fallback === "string") {
				if (!validateId(expr.fallback)) {
					addError(state, "try expression fallback must be a valid identifier", expr);
				}
			} else {
				validatePIRExpr(expr.fallback, state);
			}
		}
		break;
	}
}

/**
 * Validate a PIR block
 */
function validatePIRBlock(block: unknown, state: ValidationState): void {
	if (!validateObject(block)) {
		addError(state, "Block must be an object", block);
		return;
	}

	if (typeof block.id !== "string") {
		addError(state, "Block must have an id", block.id);
	}

	if (!Array.isArray(block.instructions)) {
		addError(state, "Block must have instructions array", block.instructions);
	}

	if (!validateObject(block.terminator)) {
		addError(state, "Block must have a terminator object", block.terminator);
	}
}

