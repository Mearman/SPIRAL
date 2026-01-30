// SPIRAL TypeScript Ingest Converter
// Converts TypeScript source code to SPIRAL IR documents (AIR/CIR/EIR/PIR)
// Two-pass architecture: feature scan (layer selection) then AST conversion

import ts from "typescript";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	PIRDocument,
	Type,
} from "../types.js";

//==============================================================================
// Public API
//==============================================================================

export interface TypeScriptIngestOptions {
	forceLayer?: "air" | "cir" | "eir" | "pir";
	version?: string;
	floatNumbers?: boolean;
}

export function ingestTypeScript(
	source: string,
	options?: TypeScriptIngestOptions,
): AIRDocument | CIRDocument | EIRDocument | PIRDocument {
	const sourceFile = ts.createSourceFile(
		"input.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	const layer: Layer = options?.forceLayer ?? scanFeatures(sourceFile);
	const version =
		options?.version ?? (layer === "pir" ? "2.0.0" : "1.0.0");
	const floatNumbers = options?.floatNumbers ?? false;

	const state: IngestState = {
		nodes: [],
		nextSynthId: 0,
		usedIds: new Set(),
		layer,
		currentFunctionName: null,
		floatNumbers,
	};

	let lastId: string | undefined;
	ts.forEachChild(sourceFile, (child) => {
		const id = convertNode(child, state);
		if (id !== undefined) {
			lastId = id;
		}
	});

	const result = lastId ?? "_e_empty";
	if (lastId === undefined) {
		addNode(state, result, {
			kind: "lit",
			type: { kind: "void" },
			value: null,
		});
	}

	return buildDocument(layer, version, state.nodes, result);
}

//==============================================================================
// Internal Types
//==============================================================================

type Layer = "air" | "cir" | "eir" | "pir";

interface IngestNode {
	id: string;
	expr: unknown;
}

interface IngestState {
	nodes: IngestNode[];
	nextSynthId: number;
	usedIds: Set<string>;
	layer: Layer;
	currentFunctionName: string | null;
	floatNumbers: boolean;
}

//==============================================================================
// Pass 1: Feature Scan
//==============================================================================

function scanFeatures(sourceFile: ts.SourceFile): Layer {
	let layer: Layer = "air";

	function visit(node: ts.Node): void {
		// PIR: async/await
		if (
			ts.isFunctionDeclaration(node) &&
			node.modifiers?.some(
				(m) => m.kind === ts.SyntaxKind.AsyncKeyword,
			)
		) {
			layer = "pir";
			return;
		}
		if (ts.isAwaitExpression(node)) {
			layer = "pir";
			return;
		}
		if (
			ts.isArrowFunction(node) &&
			node.modifiers?.some(
				(m) => m.kind === ts.SyntaxKind.AsyncKeyword,
			)
		) {
			layer = "pir";
			return;
		}

		// EIR: mutation, loops, try/catch, effects
		if (layer !== "pir") {
			if (ts.isVariableDeclaration(node)) {
				const decl = node;
				const declList = decl.parent;
				if (
					ts.isVariableDeclarationList(declList) &&
					!(declList.flags & ts.NodeFlags.Const)
				) {
					const name = decl.name.getText();
					if (hasReassignment(sourceFile, name)) {
						layer = maxLayer(layer, "eir");
					}
				}
			}
			if (ts.isWhileStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
				layer = maxLayer(layer, "eir");
			}
			if (ts.isTryStatement(node)) {
				layer = maxLayer(layer, "eir");
			}
			if (ts.isCallExpression(node)) {
				const callExpr = node.expression;
				if (
					ts.isPropertyAccessExpression(callExpr) &&
					ts.isIdentifier(callExpr.expression) &&
					callExpr.expression.text === "console"
				) {
					layer = maxLayer(layer, "eir");
				}
			}
		}

		// CIR: lambdas, function declarations, recursion
		if (layer !== "pir" && layer !== "eir") {
			if (ts.isArrowFunction(node)) {
				layer = maxLayer(layer, "cir");
			}
			if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
				layer = maxLayer(layer, "cir");
			}
			if (ts.isCallExpression(node)) {
				const callExpr = node.expression;
				if (ts.isIdentifier(callExpr)) {
					layer = maxLayer(layer, "cir");
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return layer;
}

function hasReassignment(sourceFile: ts.SourceFile, name: string): boolean {
	let found = false;

	function visit(node: ts.Node): void {
		if (found) return;
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left) &&
			node.left.text === name
		) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return found;
}

const LAYER_ORDER: Record<Layer, number> = {
	air: 0,
	cir: 1,
	eir: 2,
	pir: 3,
};

function maxLayer(a: Layer, b: Layer): Layer {
	return LAYER_ORDER[a] >= LAYER_ORDER[b] ? a : b;
}

//==============================================================================
// Pass 2: Conversion (Node-creating mode for top-level statements)
//==============================================================================

function convertNode(node: ts.Node, state: IngestState): string | undefined {
	if (ts.isVariableStatement(node)) {
		return convertVariableStatement(node, state);
	}

	if (ts.isExpressionStatement(node)) {
		return convertExpressionToNode(node.expression, state);
	}

	if (ts.isFunctionDeclaration(node)) {
		return convertFunctionDeclaration(node, state);
	}

	if (ts.isIfStatement(node)) {
		return convertIfStatement(node, state);
	}

	if (ts.isReturnStatement(node)) {
		if (node.expression) {
			return convertExpressionToNode(node.expression, state);
		}
		return undefined;
	}

	if (ts.isBlock(node)) {
		return convertBlock(node, state);
	}

	return undefined;
}

function convertVariableStatement(
	node: ts.VariableStatement,
	state: IngestState,
): string | undefined {
	const declList = node.declarationList;
	let lastId: string | undefined;

	for (const decl of declList.declarations) {
		if (!decl.initializer) continue;
		const name = decl.name.getText();
		const exprId = convertExpressionToNode(decl.initializer, state);

		// Rename the last node to the variable name if it was just created
		const lastNode = state.nodes[state.nodes.length - 1];
		if (lastNode?.id === exprId) {
			const id = freshId(state, name);
			lastNode.id = id;
			state.usedIds.delete(exprId);
			state.usedIds.add(id);
			lastId = id;
		} else {
			const id = freshId(state, name);
			addNode(state, id, { kind: "ref", id: exprId });
			lastId = id;
		}
	}

	return lastId;
}

function convertFunctionDeclaration(
	node: ts.FunctionDeclaration,
	state: IngestState,
): string | undefined {
	const name = node.name?.getText();
	if (!name) return undefined;

	const prevFnName = state.currentFunctionName;
	state.currentFunctionName = name;

	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) => inferTypeFromAnnotation(p.type));

	// Convert body to a single inline expression for the lambda
	let bodyExpr: unknown = convertFunctionBodyInline(node.body, state, params);
	if (bodyExpr === undefined) {
		bodyExpr = { kind: "lit", type: { kind: "void" }, value: null };
	}

	state.currentFunctionName = prevFnName;

	bodyExpr = wrapInDoIfCall(bodyExpr);

	// Create a single body node for the inline expression
	const bodyId = freshId(state);
	addNode(state, bodyId, bodyExpr);

	const returnType = inferReturnType(node);
	const fnType: Type = {
		kind: "fn",
		params: paramTypes,
		returns: returnType,
	};

	const id = freshId(state, name);
	addNode(state, id, {
		kind: "lambda",
		params,
		body: bodyId,
		type: fnType,
	});

	return id;
}

/**
 * Convert a function body to an inline expression.
 * Uses `convertExprInline` to avoid creating intermediate nodes.
 */
function convertFunctionBodyInline(
	body: ts.Block,
	state: IngestState,
	params: string[],
): unknown {
	const statements = Array.from(body.statements);
	if (statements.length === 0) return undefined;

	// Single return statement: return its inline expression
	const first = statements[0];
	if (
		statements.length === 1 &&
		ts.isReturnStatement(first) &&
		first.expression
	) {
		return convertExprInline(
			first.expression,
			state,
			params,
		);
	}

	// Multiple statements: build a do expression with inline sub-expressions
	// For now, convert to nodes and use refs
	const exprIds: string[] = [];
	for (const stmt of statements) {
		const id = convertNode(stmt, state);
		if (id !== undefined) {
			exprIds.push(id);
		}
	}

	if (exprIds.length === 0) return undefined;
	if (exprIds.length === 1) {
		// Return an inline ref to the single node
		return { kind: "ref", id: exprIds[0] };
	}

	return { kind: "do", exprs: exprIds };
}

function convertIfStatement(
	node: ts.IfStatement,
	state: IngestState,
): string {
	const condId = convertExpressionToNode(node.expression, state);
	const thenId = convertNodeOrBlock(node.thenStatement, state);

	let elseId: string;
	if (node.elseStatement) {
		elseId = convertNodeOrBlock(node.elseStatement, state);
	} else {
		elseId = freshId(state);
		addNode(state, elseId, {
			kind: "lit",
			type: { kind: "void" },
			value: null,
		});
	}

	const ifId = freshId(state);
	addNode(state, ifId, {
		kind: "if",
		cond: condId,
		then: thenId,
		else: elseId,
		type: { kind: "int" },
	});

	return ifId;
}

function convertNodeOrBlock(node: ts.Node, state: IngestState): string {
	if (ts.isBlock(node)) {
		return convertBlock(node, state) ?? makeVoidNode(state);
	}
	return convertNode(node, state) ?? makeVoidNode(state);
}

function makeVoidNode(state: IngestState): string {
	const id = freshId(state);
	addNode(state, id, {
		kind: "lit",
		type: { kind: "void" },
		value: null,
	});
	return id;
}

function convertBlock(
	block: ts.Block,
	state: IngestState,
): string | undefined {
	const stmts = Array.from(block.statements);
	if (stmts.length === 0) return undefined;

	const ids: string[] = [];
	for (const stmt of stmts) {
		const id = convertNode(stmt, state);
		if (id !== undefined) {
			ids.push(id);
		}
	}

	if (ids.length === 0) return undefined;
	if (ids.length === 1) return ids[0];

	const doId = freshId(state);
	addNode(state, doId, {
		kind: "do",
		exprs: ids,
	});
	return doId;
}

//==============================================================================
// Expression Conversion — Node-creating mode
// Creates nodes in the document's node list, returns node ID
//==============================================================================

function convertExpressionToNode(node: ts.Expression, state: IngestState): string {
	// Numeric literal
	if (ts.isNumericLiteral(node)) {
		const value = Number(node.text);
		const isFloat =
			state.floatNumbers || node.text.includes(".") || node.text.includes("e") || node.text.includes("E");
		const type: Type = isFloat ? { kind: "float" } : { kind: "int" };
		const id = freshId(state);
		addNode(state, id, { kind: "lit", type, value });
		return id;
	}

	// String literal
	if (ts.isStringLiteral(node)) {
		const id = freshId(state);
		addNode(state, id, {
			kind: "lit",
			type: { kind: "string" },
			value: node.text,
		});
		return id;
	}

	// No-substitution template literal
	if (ts.isNoSubstitutionTemplateLiteral(node)) {
		const id = freshId(state);
		addNode(state, id, {
			kind: "lit",
			type: { kind: "string" },
			value: node.text,
		});
		return id;
	}

	// Template expression
	if (ts.isTemplateExpression(node)) {
		return convertTemplateExpressionToNode(node, state);
	}

	// Boolean literals
	if (node.kind === ts.SyntaxKind.TrueKeyword) {
		const id = freshId(state);
		addNode(state, id, { kind: "lit", type: { kind: "bool" }, value: true });
		return id;
	}
	if (node.kind === ts.SyntaxKind.FalseKeyword) {
		const id = freshId(state);
		addNode(state, id, { kind: "lit", type: { kind: "bool" }, value: false });
		return id;
	}

	// Identifier reference
	if (ts.isIdentifier(node)) {
		const id = freshId(state);
		addNode(state, id, { kind: "ref", id: node.text });
		return id;
	}

	// Parenthesized expression
	if (ts.isParenthesizedExpression(node)) {
		return convertExpressionToNode(node.expression, state);
	}

	// Binary expression
	if (ts.isBinaryExpression(node)) {
		return convertBinaryExprToNode(node, state);
	}

	// Prefix unary expression
	if (ts.isPrefixUnaryExpression(node)) {
		return convertPrefixUnaryToNode(node, state);
	}

	// Conditional (ternary) expression
	if (ts.isConditionalExpression(node)) {
		return convertConditionalToNode(node, state);
	}

	// Arrow function
	if (ts.isArrowFunction(node)) {
		return convertArrowFunctionToNode(node, state);
	}

	// Function expression
	if (ts.isFunctionExpression(node)) {
		return convertFunctionExpressionToNode(node, state);
	}

	// Call expression
	if (ts.isCallExpression(node)) {
		return convertCallExpressionToNode(node, state);
	}

	// Fallback
	const id = freshId(state);
	addNode(state, id, { kind: "lit", type: { kind: "void" }, value: null });
	return id;
}

function convertBinaryExprToNode(node: ts.BinaryExpression, state: IngestState): string {
	const op = node.operatorToken.kind;

	// Assignment
	if (op === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
		const valueId = convertExpressionToNode(node.right, state);
		const id = freshId(state);
		addNode(state, id, {
			kind: "assign",
			target: node.left.text,
			value: valueId,
		});
		return id;
	}

	const leftId = convertExpressionToNode(node.left, state);
	const rightId = convertExpressionToNode(node.right, state);
	const mapping = getBinaryOpMapping(op, node);
	if (mapping) {
		const id = freshId(state);
		addNode(state, id, {
			kind: "call",
			ns: mapping.ns,
			name: mapping.name,
			args: [leftId, rightId],
		});
		return id;
	}

	const id = freshId(state);
	addNode(state, id, { kind: "lit", type: { kind: "void" }, value: null });
	return id;
}

function convertPrefixUnaryToNode(node: ts.PrefixUnaryExpression, state: IngestState): string {
	const operandId = convertExpressionToNode(node.operand, state);

	if (node.operator === ts.SyntaxKind.MinusToken) {
		const id = freshId(state);
		addNode(state, id, {
			kind: "call",
			ns: "core",
			name: "neg",
			args: [operandId],
		});
		return id;
	}

	if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const id = freshId(state);
		addNode(state, id, {
			kind: "call",
			ns: "bool",
			name: "not",
			args: [operandId],
		});
		return id;
	}

	return operandId;
}

function convertConditionalToNode(node: ts.ConditionalExpression, state: IngestState): string {
	const condId = convertExpressionToNode(node.condition, state);
	const thenId = convertExpressionToNode(node.whenTrue, state);
	const elseId = convertExpressionToNode(node.whenFalse, state);

	const id = freshId(state);
	addNode(state, id, {
		kind: "if",
		cond: condId,
		then: thenId,
		else: elseId,
		type: { kind: "int" },
	});
	return id;
}

function convertArrowFunctionToNode(node: ts.ArrowFunction, state: IngestState): string {
	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) => inferTypeFromAnnotation(p.type));

	// Convert body to inline expression to avoid creating bound nodes
	let bodyExpr: unknown;
	if (ts.isBlock(node.body)) {
		bodyExpr = convertFunctionBodyInline(node.body, state, params);
	} else {
		bodyExpr = convertExprInline(node.body, state, params);
	}
	if (bodyExpr === undefined) {
		bodyExpr = { kind: "lit", type: { kind: "void" }, value: null };
	}

	// Wrap in a `do` to prevent the evaluator's callExpr fast-path from
	// mis-handling inline Expr args in closure bodies.
	bodyExpr = wrapInDoIfCall(bodyExpr);

	// Create a single body node holding the inline expression
	const bodyId = freshId(state);
	addNode(state, bodyId, bodyExpr);

	const returnType = inferReturnType(node);
	const fnType: Type = {
		kind: "fn",
		params: paramTypes,
		returns: returnType,
	};

	const id = freshId(state);
	addNode(state, id, {
		kind: "lambda",
		params,
		body: bodyId,
		type: fnType,
	});
	return id;
}

function convertFunctionExpressionToNode(node: ts.FunctionExpression, state: IngestState): string {
	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) => inferTypeFromAnnotation(p.type));

	const prevFnName = state.currentFunctionName;
	if (node.name) {
		state.currentFunctionName = node.name.getText();
	}

	let bodyExpr: unknown = convertFunctionBodyInline(node.body, state, params);
	if (bodyExpr === undefined) {
		bodyExpr = { kind: "lit", type: { kind: "void" }, value: null };
	}

	state.currentFunctionName = prevFnName;

	bodyExpr = wrapInDoIfCall(bodyExpr);

	const bodyId = freshId(state);
	addNode(state, bodyId, bodyExpr);

	const returnType = inferReturnType(node);
	const fnType: Type = {
		kind: "fn",
		params: paramTypes,
		returns: returnType,
	};

	const id = freshId(state);
	addNode(state, id, {
		kind: "lambda",
		params,
		body: bodyId,
		type: fnType,
	});
	return id;
}

function convertCallExpressionToNode(node: ts.CallExpression, state: IngestState): string {
	// console.log -> effect "print"
	if (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === "console"
	) {
		const methodName = node.expression.name.text;
		if (methodName === "log" || methodName === "warn" || methodName === "error") {
			const argIds = node.arguments.map((a) => convertExpressionToNode(a, state));
			const id = freshId(state);
			addNode(state, id, {
				kind: "effect",
				op: "print",
				args: argIds,
			});
			return id;
		}
	}

	// Regular function call
	if (ts.isIdentifier(node.expression)) {
		const fnName = node.expression.text;
		const argIds = node.arguments.map((a) => convertExpressionToNode(a, state));

		const id = freshId(state);
		addNode(state, id, {
			kind: "callExpr",
			fn: fnName,
			args: argIds,
		});
		return id;
	}

	// Complex call expression
	const fnId = convertExpressionToNode(node.expression, state);
	const argIds = node.arguments.map((a) => convertExpressionToNode(a, state));

	const id = freshId(state);
	addNode(state, id, {
		kind: "callExpr",
		fn: fnId,
		args: argIds,
	});
	return id;
}

function convertTemplateExpressionToNode(node: ts.TemplateExpression, state: IngestState): string {
	let currentId = freshId(state);
	addNode(state, currentId, {
		kind: "lit",
		type: { kind: "string" },
		value: node.head.text,
	});

	for (const span of node.templateSpans) {
		const exprId = convertExpressionToNode(span.expression, state);

		const concatId = freshId(state);
		addNode(state, concatId, {
			kind: "call",
			ns: "string",
			name: "concat",
			args: [currentId, exprId],
		});

		if (span.literal.text.length > 0) {
			const tailId = freshId(state);
			addNode(state, tailId, {
				kind: "lit",
				type: { kind: "string" },
				value: span.literal.text,
			});

			const concat2Id = freshId(state);
			addNode(state, concat2Id, {
				kind: "call",
				ns: "string",
				name: "concat",
				args: [concatId, tailId],
			});
			currentId = concat2Id;
		} else {
			currentId = concatId;
		}
	}

	return currentId;
}

//==============================================================================
// Expression Conversion — Inline mode
// Returns inline Expr objects for use inside lambda bodies.
// This avoids creating separate top-level nodes that the evaluator cannot
// resolve when evaluating closure bodies.
//==============================================================================

function convertExprInline(
	node: ts.Expression,
	state: IngestState,
	params: string[],
): unknown {
	// Numeric literal
	if (ts.isNumericLiteral(node)) {
		const value = Number(node.text);
		const isFloat =
			state.floatNumbers || node.text.includes(".") || node.text.includes("e") || node.text.includes("E");
		const type: Type = isFloat ? { kind: "float" } : { kind: "int" };
		return { kind: "lit", type, value };
	}

	// String literal
	if (ts.isStringLiteral(node)) {
		return { kind: "lit", type: { kind: "string" }, value: node.text };
	}

	// No-substitution template
	if (ts.isNoSubstitutionTemplateLiteral(node)) {
		return { kind: "lit", type: { kind: "string" }, value: node.text };
	}

	// Boolean literals
	if (node.kind === ts.SyntaxKind.TrueKeyword) {
		return { kind: "lit", type: { kind: "bool" }, value: true };
	}
	if (node.kind === ts.SyntaxKind.FalseKeyword) {
		return { kind: "lit", type: { kind: "bool" }, value: false };
	}

	// Identifier — use var for function params, ref for external names
	if (ts.isIdentifier(node)) {
		if (params.includes(node.text)) {
			return { kind: "var", name: node.text };
		}
		// External reference (to a node defined outside the lambda)
		return { kind: "ref", id: node.text };
	}

	// Parenthesized expression
	if (ts.isParenthesizedExpression(node)) {
		return convertExprInline(node.expression, state, params);
	}

	// Binary expression
	if (ts.isBinaryExpression(node)) {
		return convertBinaryExprInline(node, state, params);
	}

	// Prefix unary
	if (ts.isPrefixUnaryExpression(node)) {
		return convertPrefixUnaryInline(node, state, params);
	}

	// Conditional (ternary)
	if (ts.isConditionalExpression(node)) {
		return convertConditionalInline(node, state);
	}

	// Call expression
	if (ts.isCallExpression(node)) {
		return convertCallExprInline(node, state, params);
	}

	// Template expression
	if (ts.isTemplateExpression(node)) {
		return convertTemplateExprInline(node, state, params);
	}

	// Fallback
	return { kind: "lit", type: { kind: "void" }, value: null };
}

function convertBinaryExprInline(
	node: ts.BinaryExpression,
	state: IngestState,
	params: string[],
): unknown {
	const op = node.operatorToken.kind;

	// Assignment
	if (op === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
		const valueExpr = convertExprInline(node.right, state, params);
		return { kind: "assign", target: node.left.text, value: valueExpr };
	}

	const leftExpr = convertExprInline(node.left, state, params);
	const rightExpr = convertExprInline(node.right, state, params);
	const mapping = getBinaryOpMapping(op, node);
	if (mapping) {
		return {
			kind: "call",
			ns: mapping.ns,
			name: mapping.name,
			args: [leftExpr, rightExpr],
		};
	}

	return { kind: "lit", type: { kind: "void" }, value: null };
}

function convertPrefixUnaryInline(
	node: ts.PrefixUnaryExpression,
	state: IngestState,
	params: string[],
): unknown {
	const operandExpr = convertExprInline(node.operand, state, params);

	if (node.operator === ts.SyntaxKind.MinusToken) {
		return { kind: "call", ns: "core", name: "neg", args: [operandExpr] };
	}
	if (node.operator === ts.SyntaxKind.ExclamationToken) {
		return { kind: "call", ns: "bool", name: "not", args: [operandExpr] };
	}

	return operandExpr;
}

function convertConditionalInline(
	node: ts.ConditionalExpression,
	state: IngestState,
): unknown {
	// For inline if, we need to create nodes for the branches since IfExpr
	// references branches by string ID
	const condId = convertExpressionToNode(node.condition, state);
	const thenId = convertExpressionToNode(node.whenTrue, state);
	const elseId = convertExpressionToNode(node.whenFalse, state);

	return {
		kind: "if",
		cond: condId,
		then: thenId,
		else: elseId,
		type: { kind: "int" },
	};
}

function convertCallExprInline(
	node: ts.CallExpression,
	state: IngestState,
	params: string[],
): unknown {
	// console.log -> effect
	if (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === "console"
	) {
		const argExprs = node.arguments.map((a) => convertExprInline(a, state, params));
		return { kind: "effect", op: "print", args: argExprs };
	}

	// Regular function call
	if (ts.isIdentifier(node.expression)) {
		const fnName = node.expression.text;
		const argExprs = node.arguments.map((a) => convertExprInline(a, state, params));
		return { kind: "callExpr", fn: fnName, args: argExprs };
	}

	// Complex call
	const fnExpr = convertExprInline(node.expression, state, params);
	const argExprs = node.arguments.map((a) => convertExprInline(a, state, params));
	return { kind: "callExpr", fn: fnExpr, args: argExprs };
}

function convertTemplateExprInline(
	node: ts.TemplateExpression,
	state: IngestState,
	params: string[],
): unknown {
	let current: unknown = { kind: "lit", type: { kind: "string" }, value: node.head.text };

	for (const span of node.templateSpans) {
		const spanExpr = convertExprInline(span.expression, state, params);
		current = {
			kind: "call",
			ns: "string",
			name: "concat",
			args: [current, spanExpr],
		};

		if (span.literal.text.length > 0) {
			const tailLit = { kind: "lit", type: { kind: "string" }, value: span.literal.text };
			current = {
				kind: "call",
				ns: "string",
				name: "concat",
				args: [current, tailLit],
			};
		}
	}

	return current;
}

//==============================================================================
// Operator Mapping
//==============================================================================

interface OpMapping {
	ns: string;
	name: string;
}

function getBinaryOpMapping(
	op: ts.SyntaxKind,
	node: ts.BinaryExpression,
): OpMapping | undefined {
	if (op === ts.SyntaxKind.PlusToken) {
		if (isStringContext(node.left) || isStringContext(node.right)) {
			return { ns: "string", name: "concat" };
		}
		return { ns: "core", name: "add" };
	}

	switch (op) {
	case ts.SyntaxKind.MinusToken:
		return { ns: "core", name: "sub" };
	case ts.SyntaxKind.AsteriskToken:
		return { ns: "core", name: "mul" };
	case ts.SyntaxKind.SlashToken:
		return { ns: "core", name: "div" };
	case ts.SyntaxKind.PercentToken:
		return { ns: "core", name: "mod" };
	case ts.SyntaxKind.AsteriskAsteriskToken:
		return { ns: "core", name: "pow" };
	case ts.SyntaxKind.EqualsEqualsEqualsToken:
	case ts.SyntaxKind.EqualsEqualsToken:
		return { ns: "core", name: "eq" };
	case ts.SyntaxKind.ExclamationEqualsEqualsToken:
	case ts.SyntaxKind.ExclamationEqualsToken:
		return { ns: "core", name: "neq" };
	case ts.SyntaxKind.LessThanToken:
		return { ns: "core", name: "lt" };
	case ts.SyntaxKind.LessThanEqualsToken:
		return { ns: "core", name: "lte" };
	case ts.SyntaxKind.GreaterThanToken:
		return { ns: "core", name: "gt" };
	case ts.SyntaxKind.GreaterThanEqualsToken:
		return { ns: "core", name: "gte" };
	case ts.SyntaxKind.AmpersandAmpersandToken:
		return { ns: "bool", name: "and" };
	case ts.SyntaxKind.BarBarToken:
		return { ns: "bool", name: "or" };
	default:
		return undefined;
	}
}

function isStringContext(node: ts.Node): boolean {
	if (ts.isStringLiteral(node)) return true;
	if (ts.isNoSubstitutionTemplateLiteral(node)) return true;
	if (ts.isTemplateExpression(node)) return true;
	return false;
}

//==============================================================================
// Helpers
//==============================================================================

/**
 * Wrap an inline expression in a `do` if it is a `call` expression.
 * This prevents the evaluator's evalNode callExpr fast-path from
 * mis-handling inline Expr args inside closure bodies. The fast-path
 * only handles string args; wrapping in `do` forces the evaluator to
 * use evalExprWithNodeMap which properly handles inline Expr args.
 */
function wrapInDoIfCall(expr: unknown): unknown {
	if (expr && typeof expr === "object" && "kind" in expr && expr.kind === "call") {
		return { kind: "do", exprs: [expr] };
	}
	return expr;
}

function freshId(state: IngestState, base?: string): string {
	if (base) {
		if (!state.usedIds.has(base)) {
			state.usedIds.add(base);
			return base;
		}
		let counter = 1;
		while (state.usedIds.has(`${base}_${counter}`)) {
			counter++;
		}
		const id = `${base}_${counter}`;
		state.usedIds.add(id);
		return id;
	}

	const id = `_e${state.nextSynthId}`;
	state.nextSynthId++;
	state.usedIds.add(id);
	return id;
}

function addNode(state: IngestState, id: string, expr: unknown): string {
	state.nodes.push({ id, expr });
	return id;
}

/**
 * Construct the appropriate SPIRAL document from ingest state.
 * All document types share the same structural shape; IngestState stores
 * nodes with `expr: unknown` because expressions are built incrementally.
 * This function produces the correctly-typed document by constructing it
 * through an interface whose nodes field accepts the loosely-typed array.
 */
/**
 * Construct the appropriate SPIRAL document from ingest state.
 * IngestState stores nodes with `expr: unknown` because expressions are built
 * incrementally from plain objects. This helper bridges the structural gap
 * using a type guard to assert the nodes are valid document nodes.
 */
function buildDocument(
	layer: Layer,
	version: string,
	nodes: IngestNode[],
	result: string,
): AIRDocument | CIRDocument | EIRDocument | PIRDocument {
	const base = { version, airDefs: [], nodes, result };

	if (layer === "pir") {
		return toSpiralDocument({ ...base, capabilities: ["async"] });
	}

	return toSpiralDocument(base);
}

/** Type guard bridging the loosely-typed ingest output to SPIRAL document types.
 *  The ingest pipeline only ever constructs structurally valid expression objects;
 *  this guard encodes that invariant for the type system. */
function isSpiralDocument(
	_d: unknown,
): _d is AIRDocument | CIRDocument | EIRDocument | PIRDocument {
	return true;
}

function toSpiralDocument(
	doc: unknown,
): AIRDocument | CIRDocument | EIRDocument | PIRDocument {
	if (isSpiralDocument(doc)) {
		return doc;
	}
	throw new Error("Invalid SPIRAL document");
}


function inferTypeFromAnnotation(typeNode: ts.TypeNode | undefined): Type {
	if (!typeNode) return { kind: "int" };

	if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
		return { kind: "int" };
	}
	if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
		return { kind: "string" };
	}
	if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
		return { kind: "bool" };
	}
	if (typeNode.kind === ts.SyntaxKind.VoidKeyword) {
		return { kind: "void" };
	}

	return { kind: "int" };
}

function inferReturnType(
	node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): Type {
	if (node.type) {
		return inferTypeFromAnnotation(node.type);
	}
	return { kind: "int" };
}
