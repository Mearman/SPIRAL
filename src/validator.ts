// CAIRS Schema Validator
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

function validateString(value: unknown): boolean {
	return typeof value === "string";
}

function validateArray(value: unknown): boolean {
	return Array.isArray(value);
}

function validateObject(value: unknown): boolean {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(value: unknown): boolean {
	return typeof value === "string" && ID_PATTERN.test(value);
}

function validateVersion(value: unknown): boolean {
	return typeof value === "string" && SEMVER_PATTERN.test(value);
}

//==============================================================================
// Type Validation
//==============================================================================

function validateType(state: ValidationState, value: unknown): value is Type {
	if (!validateObject(value)) {
		addError(state, "Type must be an object", value);
		return false;
	}

	const t = value as Record<string, unknown>;
	if (!validateString(t.kind)) {
		addError(state, "Type must have 'kind' property", value);
		return false;
	}

	const kind = t.kind as string;

	switch (kind) {
		case "bool":
		case "int":
		case "float":
		case "string":
			return true;

		case "set":
		case "list":
		case "option":
			if (!t.of) {
				addError(state, kind + " type must have 'of' property", value);
				return false;
			}
			pushPath(state, "of");
			const ofValid = validateType(state, t.of);
			popPath(state);
			return ofValid;

		case "map":
			if (!t.key || !t.value) {
				addError(
					state,
					"map type must have 'key' and 'value' properties",
					value,
				);
				return false;
			}
			pushPath(state, "key");
			const keyValid = validateType(state, t.key);
			popPath(state);
			pushPath(state, "value");
			const valValid = validateType(state, t.value);
			popPath(state);
			return keyValid && valValid;

		case "opaque":
			if (!validateString(t.name)) {
				addError(state, "opaque type must have 'name' property", value);
				return false;
			}
			return true;

		case "fn":
			if (!validateArray(t.params)) {
				addError(state, "fn type must have 'params' array", value);
				return false;
			}
			if (!t.returns) {
				addError(state, "fn type must have 'returns' property", value);
				return false;
			}
			let paramsValid = true;
			for (let i = 0; i < (t.params as unknown[]).length; i++) {
				pushPath(state, "params[" + String(i) + "]");
				if (!validateType(state, (t.params as unknown[])[i])) {
					paramsValid = false;
				}
				popPath(state);
			}
			pushPath(state, "returns");
			const returnsValid = validateType(state, t.returns);
			popPath(state);
			return paramsValid && returnsValid;

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

	const e = value as Record<string, unknown>;
	if (!validateString(e.kind)) {
		addError(state, "Expression must have 'kind' property", value);
		return false;
	}

	const kind = e.kind as string;

	switch (kind) {
		case "lit":
			if (!e.type) {
				addError(state, "lit expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const typeValid = validateType(state, e.type);
			popPath(state);
			return typeValid;

		case "ref":
			if (!validateId(e.id)) {
				addError(state, "ref expression must have valid 'id' property", value);
				return false;
			}
			return true;

		case "var":
			if (!validateId(e.name)) {
				addError(
					state,
					"var expression must have valid 'name' property",
					value,
				);
				return false;
			}
			return true;

		case "call":
			if (!validateId(e.ns) || !validateId(e.name)) {
				addError(
					state,
					"call expression must have valid 'ns' and 'name' properties",
					value,
				);
				return false;
			}
			if (!validateArray(e.args)) {
				addError(state, "call expression must have 'args' array", value);
				return false;
			}
			for (const arg of e.args as unknown[]) {
				if (!validateId(arg)) {
					addError(state, "call args must be valid identifiers", arg);
					return false;
				}
			}
			return true;

		case "if":
			if (!validateId(e.cond) || !validateId(e.then) || !validateId(e.else)) {
				addError(
					state,
					"if expression must have 'cond', 'then', 'else' identifiers",
					value,
				);
				return false;
			}
			if (!e.type) {
				addError(state, "if expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const ifTypeValid = validateType(state, e.type);
			popPath(state);
			return ifTypeValid;

		case "let":
			if (!validateId(e.name) || !validateId(e.value) || !validateId(e.body)) {
				addError(
					state,
					"let expression must have 'name', 'value', 'body' identifiers",
					value,
				);
				return false;
			}
			return true;

		case "airRef":
			if (!validateId(e.ns) || !validateId(e.name)) {
				addError(
					state,
					"airRef expression must have valid 'ns' and 'name' properties",
					value,
				);
				return false;
			}
			if (!validateArray(e.args)) {
				addError(state, "airRef expression must have 'args' array", value);
				return false;
			}
			for (const arg of e.args as unknown[]) {
				if (!validateId(arg)) {
					addError(state, "airRef args must be valid identifiers", arg);
					return false;
				}
			}
			return true;

		case "predicate":
			if (!validateId(e.name) || !validateId(e.value)) {
				addError(
					state,
					"predicate expression must have 'name' and 'value' identifiers",
					value,
				);
				return false;
			}
			return true;

		case "lambda":
			if (!allowCIR) {
				addError(
					state,
					"lambda expression is only allowed in CIR documents",
					value,
				);
				return false;
			}
			if (!validateArray(e.params)) {
				addError(state, "lambda expression must have 'params' array", value);
				return false;
			}
			for (const param of e.params as unknown[]) {
				if (!validateId(param)) {
					addError(state, "lambda params must be valid identifiers", param);
					return false;
				}
			}
			if (!validateId(e.body)) {
				addError(state, "lambda expression must have 'body' identifier", value);
				return false;
			}
			if (!e.type) {
				addError(state, "lambda expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const lambdaTypeValid = validateType(state, e.type);
			popPath(state);
			return lambdaTypeValid;

		case "callExpr":
			if (!allowCIR) {
				addError(
					state,
					"callExpr expression is only allowed in CIR documents",
					value,
				);
				return false;
			}
			if (!validateId(e.fn)) {
				addError(
					state,
					"callExpr expression must have valid 'fn' property",
					value,
				);
				return false;
			}
			if (!validateArray(e.args)) {
				addError(state, "callExpr expression must have 'args' array", value);
				return false;
			}
			for (const arg of e.args as unknown[]) {
				if (!validateId(arg)) {
					addError(state, "callExpr args must be valid identifiers", arg);
					return false;
				}
			}
			return true;

		case "fix":
			if (!allowCIR) {
				addError(
					state,
					"fix expression is only allowed in CIR documents",
					value,
				);
				return false;
			}
			if (!validateId(e.fn)) {
				addError(state, "fix expression must have valid 'fn' property", value);
				return false;
			}
			if (!e.type) {
				addError(state, "fix expression must have 'type' property", value);
				return false;
			}
			pushPath(state, "type");
			const fixTypeValid = validateType(state, e.type);
			popPath(state);
			return fixTypeValid;

		default:
			addError(state, "Unknown expression kind: " + kind, value);
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

	const def = value as Record<string, unknown>;

	if (!validateId(def.ns)) {
		addError(state, "airDef must have valid 'ns' property", value);
		return false;
	}

	if (!validateId(def.name)) {
		addError(state, "airDef must have valid 'name' property", value);
		return false;
	}

	if (!validateArray(def.params)) {
		addError(state, "airDef must have 'params' array", value);
		return false;
	}

	for (const param of def.params as unknown[]) {
		if (!validateId(param)) {
			addError(state, "airDef params must be valid identifiers", param);
			return false;
		}
	}

	if (!def.result) {
		addError(state, "airDef must have 'result' type", value);
		return false;
	}
	pushPath(state, "result");
	const resultValid = validateType(state, def.result);
	popPath(state);

	if (!def.body) {
		addError(state, "airDef must have 'body' expression", value);
		return false;
	}
	pushPath(state, "body");
	const bodyValid = validateExpr(state, def.body, false);
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
): void {
	if (visited.has(startId)) {
		addError(state, "Cyclic reference detected: " + path.join(" -> "));
		return;
	}

	const node = nodes.get(startId);
	if (!node) {
		addError(state, "Reference to non-existent node: " + startId);
		return;
	}

	visited.add(startId);

	const refs = collectRefs(node.expr);
	for (const refId of refs) {
		const newPath = [...path, refId];
		checkAcyclic(state, nodes, refId, new Set(visited), newPath);
	}
}

type NodeMap = Map<string, { expr: Record<string, unknown> }>;

function collectRefs(expr: Record<string, unknown>): string[] {
	const refs: string[] = [];

	if (expr.kind === "ref") {
		const id = expr.id;
		if (typeof id === "string") {
			refs.push(id);
		}
	} else if (expr.kind === "if") {
		const cond = expr.cond,
			then = expr.then,
			els = expr.else;
		if (typeof cond === "string") refs.push(cond);
		if (typeof then === "string") refs.push(then);
		if (typeof els === "string") refs.push(els);
	} else if (expr.kind === "let") {
		const value = expr.value,
			body = expr.body;
		if (typeof value === "string") refs.push(value);
		if (typeof body === "string") refs.push(body);
	} else if (expr.kind === "call") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "airRef") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "predicate") {
		const value = expr.value;
		if (typeof value === "string") refs.push(value);
	} else if (expr.kind === "lambda") {
		const body = expr.body;
		if (typeof body === "string") refs.push(body);
	} else if (expr.kind === "callExpr") {
		const fn = expr.fn,
			args = expr.args;
		if (typeof fn === "string") refs.push(fn);
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") refs.push(arg);
			}
		}
	} else if (expr.kind === "fix") {
		const fn = expr.fn;
		if (typeof fn === "string") refs.push(fn);
	}

	return refs;
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

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// Function signatures (optional)
	if (d.functionSigs !== undefined) {
		if (!validateArray(d.functionSigs)) {
			pushPath(state, "functionSigs");
			addError(state, "functionSigs must be an array", d.functionSigs);
			popPath(state);
		}
	}

	// AIR defs check
	if (!validateArray(d.airDefs)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", d.airDefs);
		popPath(state);
	} else {
		const airDefs = d.airDefs as unknown[];
		for (let i = 0; i < airDefs.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, airDefs[i]);
			popPath(state);
		}
	}

	// Nodes check
	if (!validateArray(d.nodes)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", d.nodes);
		popPath(state);
	} else {
		const nodes = d.nodes as unknown[];
		const nodeIds = new Set<string>();

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Node ID check
			if (!validateId(n.id)) {
				addError(state, "Node must have valid 'id' property", n.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(String(n.id))) {
					addError(state, "Duplicate node id: " + String(n.id), n.id);
				}
				nodeIds.add(String(n.id));
			}

			// Node expression check
			if (!n.expr) {
				addError(state, "Node must have 'expr' property", node);
			} else {
				pushPath(state, "expr");
				validateExpr(state, n.expr, false);
				popPath(state);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(d.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", d.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodeIds = new Set(
			(d.nodes as Array<{ id: string }> | undefined)?.map((n) => n.id) ?? [],
		);
		if (!nodeIds.has(String(d.result))) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + String(d.result),
				d.result,
			);
			popPath(state);
		}
	}

	// Build node map for acyclic checking
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as Array<{
			id: string;
			expr: Record<string, unknown>;
		}>;
		const nodeMap: NodeMap = new Map();
		for (const node of nodes) {
			if (typeof node.id === "string") {
				nodeMap.set(node.id, node);
			}
		}

		// Check each node for cycles
		for (const node of nodes) {
			if (typeof node.id === "string") {
				checkAcyclic(state, nodeMap, node.id, new Set(), [node.id]);
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<AIRDocument>(state.errors);
	}

	return validResult(doc as AIRDocument);
}

export function validateCIR(doc: unknown): ValidationResult<CIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "Document must be an object", doc);
		return invalidResult<CIRDocument>(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// AIR defs check (same for CIR)
	if (!validateArray(d.airDefs)) {
		pushPath(state, "airDefs");
		addError(state, "Document must have 'airDefs' array", d.airDefs);
		popPath(state);
	} else {
		const airDefs = d.airDefs as unknown[];
		for (let i = 0; i < airDefs.length; i++) {
			pushPath(state, "airDefs[" + String(i) + "]");
			validateAirDef(state, airDefs[i]);
			popPath(state);
		}
	}

	// Nodes check (allow CIR expressions)
	if (!validateArray(d.nodes)) {
		pushPath(state, "nodes");
		addError(state, "Document must have 'nodes' array", d.nodes);
		popPath(state);
	} else {
		const nodes = d.nodes as unknown[];
		const nodeIds = new Set<string>();

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "nodes[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Node ID check
			if (!validateId(n.id)) {
				addError(state, "Node must have valid 'id' property", n.id);
			} else {
				// Check for duplicate IDs
				if (nodeIds.has(String(n.id))) {
					addError(state, "Duplicate node id: " + String(n.id), n.id);
				}
				nodeIds.add(String(n.id));
			}

			// Node expression check (allow CIR)
			if (!n.expr) {
				addError(state, "Node must have 'expr' property", node);
			} else {
				pushPath(state, "expr");
				validateExpr(state, n.expr, true);
				popPath(state);
			}

			popPath(state);
		}
	}

	// Result check
	if (!validateId(d.result)) {
		pushPath(state, "result");
		addError(state, "Document must have valid 'result' reference", d.result);
		popPath(state);
	} else {
		// Check that result references a valid node
		const nodeIds = new Set(
			(d.nodes as Array<{ id: string }> | undefined)?.map((n) => n.id) ?? [],
		);
		if (!nodeIds.has(String(d.result))) {
			pushPath(state, "result");
			addError(
				state,
				"Result references non-existent node: " + String(d.result),
				d.result,
			);
			popPath(state);
		}
	}

	// Build node map for acyclic checking
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as Array<{
			id: string;
			expr: Record<string, unknown>;
		}>;
		const nodeMap: NodeMap = new Map();
		for (const node of nodes) {
			if (typeof node.id === "string") {
				nodeMap.set(node.id, node);
			}
		}

		// Check each node for cycles
		for (const node of nodes) {
			if (typeof node.id === "string") {
				checkAcyclic(state, nodeMap, node.id, new Set(), [node.id]);
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult<CIRDocument>(state.errors);
	}

	return validResult(doc as CIRDocument);
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

	const d = doc as Record<string, unknown>;

	// Validate version
	pushPath(state, "version");
	if (!validateString(d.version) || !validateVersion(d.version as string)) {
		addError(state, "Document must have valid semantic version", d.version);
	}
	popPath(state);

	// Validate capabilities (optional)
	if (d.capabilities !== undefined) {
		pushPath(state, "capabilities");
		if (!validateArray(d.capabilities)) {
			addError(state, "capabilities must be an array", d.capabilities);
		}
		popPath(state);
	}

	// Validate airDefs
	pushPath(state, "airDefs");
	if (!validateArray(d.airDefs)) {
		addError(state, "airDefs must be an array", d.airDefs);
	}
	popPath(state);

	// Validate nodes and track node IDs
	const nodeIds = new Set<string>();
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as unknown[];
		pushPath(state, "nodes");
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			pushPath(state, "[" + String(i) + "]");

			if (!validateObject(node)) {
				addError(state, "Node must be an object", node);
				popPath(state);
				popPath(state);
				continue;
			}

			const n = node as Record<string, unknown>;

			// Validate node id
			pushPath(state, "id");
			if (!validateId(n.id)) {
				addError(state, "Node must have valid id", n.id);
			} else {
				const nodeId = n.id as string;
				if (nodeIds.has(nodeId)) {
					addError(state, "Duplicate node id: " + nodeId, nodeId);
				}
				nodeIds.add(nodeId);
			}
			popPath(state);

			// Validate expr (allow both CIR and EIR expressions)
			pushPath(state, "expr");
			if (!validateObject(n.expr)) {
				addError(state, "Node must have expr object", n.expr);
			} else {
				const expr = n.expr as Record<string, unknown>;
				validateEirExpr(state, expr);
			}
			popPath(state);

			popPath(state);
		}
		popPath(state);
	} else {
		addError(state, "nodes must be an array", d.nodes);
	}

	// Validate result reference
	pushPath(state, "result");
	if (!validateId(d.result)) {
		addError(state, "Result must be a valid identifier", d.result);
	} else {
		const resultId = d.result as string;
		if (!nodeIds.has(resultId)) {
			addError(state, "Result references non-existent node: " + resultId, resultId);
		}
	}
	popPath(state);

	// Validate node references in EIR expressions
	if (validateArray(d.nodes)) {
		const nodes = d.nodes as unknown[];
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (validateObject(node)) {
				const n = node as Record<string, unknown>;
				if (n.expr && validateObject(n.expr)) {
					const expr = n.expr as Record<string, unknown>;
					validateEirNodeReferences(state, expr, nodeIds);
				}
			}
		}
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	return validResult(doc as import("./types.js").EIRDocument);
}

/**
 * Validate EIR-specific expressions
 */
function validateEirExpr(state: ValidationState, expr: Record<string, unknown>): void {
	if (!validateString(expr.kind)) {
		addError(state, "Expression must have 'kind' property", expr);
		return;
	}

	const kind = expr.kind as string;

	switch (kind) {
		case "seq":
			if (!validateId(expr.first)) {
				addError(state, "seq expression must have valid 'first' identifier", expr);
			}
			if (!validateId(expr.then)) {
				addError(state, "seq expression must have valid 'then' identifier", expr);
			}
			break;

		case "assign":
			if (!validateId(expr.target)) {
				addError(state, "assign expression must have valid 'target' identifier", expr);
			}
			if (!validateId(expr.value)) {
				addError(state, "assign expression must have valid 'value' identifier", expr);
			}
			break;

		case "while":
			if (!validateId(expr.cond)) {
				addError(state, "while expression must have valid 'cond' identifier", expr);
			}
			if (!validateId(expr.body)) {
				addError(state, "while expression must have valid 'body' identifier", expr);
			}
			break;

		case "for":
			if (!validateId(expr.var)) {
				addError(state, "for expression must have valid 'var' identifier", expr);
			}
			if (!validateId(expr.init)) {
				addError(state, "for expression must have valid 'init' identifier", expr);
			}
			if (!validateId(expr.cond)) {
				addError(state, "for expression must have valid 'cond' identifier", expr);
			}
			if (!validateId(expr.update)) {
				addError(state, "for expression must have valid 'update' identifier", expr);
			}
			if (!validateId(expr.body)) {
				addError(state, "for expression must have valid 'body' identifier", expr);
			}
			break;

		case "iter":
			if (!validateId(expr.var)) {
				addError(state, "iter expression must have valid 'var' identifier", expr);
			}
			if (!validateId(expr.iter)) {
				addError(state, "iter expression must have valid 'iter' identifier", expr);
			}
			if (!validateId(expr.body)) {
				addError(state, "iter expression must have valid 'body' identifier", expr);
			}
			break;

		case "effect":
			if (!validateString(expr.op)) {
				addError(state, "effect expression must have valid 'op' string", expr);
			}
			if (!validateArray(expr.args)) {
				addError(state, "effect expression must have 'args' array", expr);
			} else {
				for (const arg of expr.args as unknown[]) {
					if (!validateId(arg)) {
						addError(state, "effect args must be valid identifiers", arg);
					}
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
			// Already validated
			break;

		default:
			addError(state, "Unknown expression kind in EIR: " + kind, expr);
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
	if (!validateString(expr.kind)) {
		return;
	}

	const kind = expr.kind as string;

	// Helper to check a node reference
	const checkRef = (ref: unknown, name: string) => {
		if (validateId(ref)) {
			const refId = ref as string;
			if (!nodeIds.has(refId)) {
				addError(state, name + " references non-existent node: " + refId, refId);
			}
		}
	};

	switch (kind) {
		case "seq":
			checkRef(expr.first, "seq.first");
			checkRef(expr.then, "seq.then");
			break;

		case "assign":
			checkRef(expr.value, "assign.value");
			break;

		case "while":
			checkRef(expr.cond, "while.cond");
			checkRef(expr.body, "while.body");
			break;

		case "for":
			checkRef(expr.init, "for.init");
			checkRef(expr.cond, "for.cond");
			checkRef(expr.update, "for.update");
			checkRef(expr.body, "for.body");
			break;

		case "iter":
			checkRef(expr.iter, "iter.iter");
			checkRef(expr.body, "iter.body");
			break;

		case "effect":
			if (validateArray(expr.args)) {
				for (let i = 0; i < (expr.args as unknown[]).length; i++) {
					checkRef((expr.args as unknown[])[i], "effect.args[" + String(i) + "]");
				}
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
 * LIR uses a CFG structure with basic blocks and terminators.
 */
export function validateLIR(doc: unknown): ValidationResult<import("./types.js").LIRDocument> {
	const state: ValidationState = { errors: [], path: [] };

	// Top-level structure check
	if (!validateObject(doc)) {
		addError(state, "LIR Document must be an object", doc);
		return invalidResult(state.errors);
	}

	const d = doc as Record<string, unknown>;

	// Version check
	if (!validateVersion(d.version)) {
		pushPath(state, "version");
		addError(state, "Document must have valid semantic version", d.version);
		popPath(state);
	}

	// Capabilities (optional)
	if (d.capabilities !== undefined && !validateArray(d.capabilities)) {
		pushPath(state, "capabilities");
		addError(state, "capabilities must be an array", d.capabilities);
		popPath(state);
	}

	// Blocks check
	if (!validateArray(d.blocks)) {
		pushPath(state, "blocks");
		addError(state, "LIR Document must have 'blocks' array", d.blocks);
		popPath(state);
		return invalidResult(state.errors);
	}

	const blocks = d.blocks as unknown[];
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

		const b = block as Record<string, unknown>;

		// Block ID check
		if (!validateId(b.id)) {
			addError(state, "Block must have valid 'id' property", b.id);
		} else {
			// Check for duplicate IDs
			if (blockIds.has(String(b.id))) {
				addError(state, "Duplicate block id: " + String(b.id), b.id);
			}
			blockIds.add(String(b.id));
		}

		// Instructions check
		if (!validateArray(b.instructions)) {
			addError(state, "Block must have 'instructions' array", b.instructions);
		} else {
			const instructions = b.instructions as unknown[];
			for (let j = 0; j < instructions.length; j++) {
				pushPath(state, "instructions[" + String(j) + "]");
				validateLirInstruction(state, instructions[j]);
				popPath(state);
			}
		}

		// Terminator check
		if (!b.terminator) {
			addError(state, "Block must have 'terminator' property", block);
		} else {
			pushPath(state, "terminator");
			validateLirTerminator(state, b.terminator);
			popPath(state);
		}

		popPath(state);
	}

	// Entry check
	if (!validateId(d.entry)) {
		pushPath(state, "entry");
		addError(state, "LIR Document must have valid 'entry' reference", d.entry);
		popPath(state);
	} else {
		// Check that entry references a valid block
		if (!blockIds.has(String(d.entry))) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + String(d.entry),
				d.entry,
			);
			popPath(state);
		}
	}

	// Validate CFG structure
	if (validateArray(d.blocks)) {
		validateCFG(state, d.blocks as Array<Record<string, unknown>>);
	}

	if (state.errors.length > 0) {
		return invalidResult(state.errors);
	}

	return validResult(doc as import("./types.js").LIRDocument);
}

/**
 * Validate an LIR instruction
 */
function validateLirInstruction(state: ValidationState, ins: unknown): void {
	if (!validateObject(ins)) {
		addError(state, "Instruction must be an object", ins);
		return;
	}

	const i = ins as Record<string, unknown>;
	if (!validateString(i.kind)) {
		addError(state, "Instruction must have 'kind' property", ins);
		return;
	}

	const kind = i.kind as string;

	switch (kind) {
		case "assign":
			if (!validateId(i.target)) {
				addError(state, "assign instruction must have valid 'target'", i.target);
			}
			if (!i.value) {
				addError(state, "assign instruction must have 'value' property", ins);
			}
			break;

		case "call":
			if (!validateId(i.target)) {
				addError(state, "call instruction must have valid 'target'", i.target);
			}
			if (!validateId(i.callee)) {
				addError(state, "call instruction must have valid 'callee'", i.callee);
			}
			if (!validateArray(i.args)) {
				addError(state, "call instruction must have 'args' array", i.args);
			}
			break;

		case "op":
			if (!validateId(i.target)) {
				addError(state, "op instruction must have valid 'target'", i.target);
			}
			if (!validateId(i.ns)) {
				addError(state, "op instruction must have valid 'ns'", i.ns);
			}
			if (!validateId(i.name)) {
				addError(state, "op instruction must have valid 'name'", i.name);
			}
			if (!validateArray(i.args)) {
				addError(state, "op instruction must have 'args' array", i.args);
			}
			break;

		case "phi":
			if (!validateId(i.target)) {
				addError(state, "phi instruction must have valid 'target'", i.target);
			}
			if (!validateArray(i.sources)) {
				addError(state, "phi instruction must have 'sources' array", i.sources);
			}
			break;

		case "effect":
			if (!validateString(i.op)) {
				addError(state, "effect instruction must have valid 'op'", i.op);
			}
			if (!validateArray(i.args)) {
				addError(state, "effect instruction must have 'args' array", i.args);
			}
			break;

		case "assignRef":
			if (!validateId(i.target)) {
				addError(state, "assignRef instruction must have valid 'target'", i.target);
			}
			if (!validateId(i.value)) {
				addError(state, "assignRef instruction must have 'value'", i.value);
			}
			break;

		default:
			addError(state, "Unknown instruction kind: " + kind, ins);
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

	const t = term as Record<string, unknown>;
	if (!validateString(t.kind)) {
		addError(state, "Terminator must have 'kind' property", term);
		return;
	}

	const kind = t.kind as string;

	switch (kind) {
		case "jump":
			if (!validateId(t.to)) {
				addError(state, "jump terminator must have valid 'to' target", t.to);
			}
			break;

		case "branch":
			if (!validateId(t.cond)) {
				addError(state, "branch terminator must have valid 'cond'", t.cond);
			}
			if (!validateId(t.then)) {
				addError(state, "branch terminator must have valid 'then' target", t.then);
			}
			if (!validateId(t.else)) {
				addError(state, "branch terminator must have valid 'else' target", t.else);
			}
			break;

		case "return":
			// value is optional
			break;

		case "exit":
			// code is optional
			break;

		default:
			addError(state, "Unknown terminator kind: " + kind, term);
			break;
	}
}

/**
 * Validate CFG structure
 * Check that all jump/branch targets reference valid blocks
 */
function validateCFG(
	state: ValidationState,
	blocks: Array<Record<string, unknown>>,
): void {
	const blockIds = new Set<string>();
	for (const block of blocks) {
		if (typeof block.id === "string") {
			blockIds.add(block.id);
		}
	}

	for (const block of blocks) {
		if (block.terminator && validateObject(block.terminator)) {
			const term = block.terminator as Record<string, unknown>;
			const kind = term.kind as string;

			if (kind === "jump") {
				const to = term.to;
				if (typeof to === "string" && !blockIds.has(to)) {
					addError(
						state,
						"Jump terminator references non-existent block: " + to,
						to,
					);
				}
			} else if (kind === "branch") {
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
		if (validateArray(block.instructions)) {
			const instructions = block.instructions as unknown[];
			for (const ins of instructions) {
				if (validateObject(ins)) {
					const i = ins as Record<string, unknown>;
					if (i.kind === "phi" && validateArray(i.sources)) {
						const sources = i.sources as unknown[];
						for (const source of sources) {
							if (validateObject(source)) {
								const s = source as Record<string, unknown>;
								const sourceBlock = s.block;
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
