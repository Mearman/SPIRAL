// Expression conversion -- Node-creating mode
// Creates nodes in the document's node list, returns node IDs.

import ts from "typescript";
import type { IngestState } from "./types.js";
import {
	freshId,
	addNode,
	addLitNode,
	getBinaryOpMapping,
	resolveExistingNodeId,
} from "./helpers.js";
import {
	convertArrowFunctionToNode,
	convertFunctionExpressionToNode,
} from "./convert-fn-node.js";

// Literal and simple expression converters

function convertNumericToNode(
	node: ts.NumericLiteral,
	state: IngestState,
): string {
	const value = Number(node.text);
	const isFloat =
		state.floatNumbers ||
		node.text.includes(".") ||
		node.text.includes("e") ||
		node.text.includes("E");
	return isFloat
		? addLitNode(state, { kind: "float" }, value)
		: addLitNode(state, { kind: "int" }, value);
}

// Binary expression converters

function convertBinaryAssignment(
	node: ts.BinaryExpression,
	targetName: string,
	state: IngestState,
): string {
	const valueId = convertExpressionToNode(node.right, state);
	const id = freshId(state);
	addNode(state, id, {
		kind: "assign",
		target: targetName,
		value: valueId,
	});
	return id;
}

function convertBinaryOp(
	node: ts.BinaryExpression,
	state: IngestState,
): string {
	const leftId = convertExpressionToNode(node.left, state);
	const rightId = convertExpressionToNode(node.right, state);
	const mapping = getBinaryOpMapping(node.operatorToken.kind, node);
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
	return addLitNode(state, { kind: "void" }, null);
}

function convertBinaryExprToNode(
	node: ts.BinaryExpression,
	state: IngestState,
): string {
	const op = node.operatorToken.kind;
	if (op === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
		return convertBinaryAssignment(node, node.left.text, state);
	}
	return convertBinaryOp(node, state);
}

// Prefix unary

function convertPrefixUnaryToNode(
	node: ts.PrefixUnaryExpression,
	state: IngestState,
): string {
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

// Conditional

function convertConditionalToNode(
	node: ts.ConditionalExpression,
	state: IngestState,
): string {
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

// Call expression

function convertConsoleCall(
	node: ts.CallExpression,
	state: IngestState,
): string | undefined {
	if (
		!ts.isPropertyAccessExpression(node.expression) ||
		!ts.isIdentifier(node.expression.expression) ||
		node.expression.expression.text !== "console"
	) {
		return undefined;
	}
	const method = node.expression.name.text;
	if (method !== "log" && method !== "warn" && method !== "error") {
		return undefined;
	}
	const argIds = node.arguments.map((a) =>
		convertExpressionToNode(a, state),
	);
	const id = freshId(state);
	addNode(state, id, { kind: "effect", op: "print", args: argIds });
	return id;
}

function convertIdentifierCall(
	node: ts.CallExpression,
	fnName: string,
	state: IngestState,
): string {
	const argIds = node.arguments.map((a) =>
		convertExpressionToNode(a, state),
	);
	const id = freshId(state);
	addNode(state, id, { kind: "callExpr", fn: fnName, args: argIds });
	return id;
}

function convertComplexCall(
	node: ts.CallExpression,
	state: IngestState,
): string {
	const fnId = convertExpressionToNode(node.expression, state);
	const argIds = node.arguments.map((a) =>
		convertExpressionToNode(a, state),
	);
	const id = freshId(state);
	addNode(state, id, { kind: "callExpr", fn: fnId, args: argIds });
	return id;
}

function convertCallExpressionToNode(
	node: ts.CallExpression,
	state: IngestState,
): string {
	const consoleResult = convertConsoleCall(node, state);
	if (consoleResult !== undefined) return consoleResult;

	if (ts.isIdentifier(node.expression)) {
		return convertIdentifierCall(node, node.expression.text, state);
	}
	return convertComplexCall(node, state);
}

// Template expression

function convertTemplateSpan(
	span: ts.TemplateSpan,
	state: IngestState,
	currentId: string,
): string {
	const exprId = convertExpressionToNode(span.expression, state);
	const concatId = freshId(state);
	addNode(state, concatId, {
		kind: "call",
		ns: "string",
		name: "concat",
		args: [currentId, exprId],
	});

	if (span.literal.text.length === 0) return concatId;

	const tailId = addLitNode(state, { kind: "string" }, span.literal.text);
	const concat2Id = freshId(state);
	addNode(state, concat2Id, {
		kind: "call",
		ns: "string",
		name: "concat",
		args: [concatId, tailId],
	});
	return concat2Id;
}

function convertTemplateExpressionToNode(
	node: ts.TemplateExpression,
	state: IngestState,
): string {
	let currentId = addLitNode(state, { kind: "string" }, node.head.text);

	for (const span of node.templateSpans) {
		currentId = convertTemplateSpan(span, state, currentId);
	}

	return currentId;
}

// Dispatch: literals
function tryConvertLiteral(
	node: ts.Expression,
	state: IngestState,
): string | undefined {
	if (ts.isNumericLiteral(node)) return convertNumericToNode(node, state);
	if (ts.isStringLiteral(node)) return addLitNode(state, { kind: "string" }, node.text);
	if (ts.isNoSubstitutionTemplateLiteral(node)) return addLitNode(state, { kind: "string" }, node.text);
	if (ts.isTemplateExpression(node)) return convertTemplateExpressionToNode(node, state);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return addLitNode(state, { kind: "bool" }, true);
	if (node.kind === ts.SyntaxKind.FalseKeyword) return addLitNode(state, { kind: "bool" }, false);
	return undefined;
}

// Dispatch: operators and references
function tryConvertOperator(
	node: ts.Expression,
	state: IngestState,
): string | undefined {
	if (ts.isIdentifier(node)) {
		const existingId = resolveExistingNodeId(state, node.text);
		if (existingId !== undefined) return existingId;

		const id = freshId(state);
		addNode(state, id, { kind: "ref", id: node.text });
		return id;
	}
	if (ts.isParenthesizedExpression(node)) return convertExpressionToNode(node.expression, state);
	if (ts.isBinaryExpression(node)) return convertBinaryExprToNode(node, state);
	if (ts.isPrefixUnaryExpression(node)) return convertPrefixUnaryToNode(node, state);
	if (ts.isConditionalExpression(node)) return convertConditionalToNode(node, state);
	return undefined;
}

// Dispatch: functions and calls
function tryConvertFnOrCall(
	node: ts.Expression,
	state: IngestState,
): string | undefined {
	if (ts.isArrowFunction(node)) return convertArrowFunctionToNode(node, state);
	if (ts.isFunctionExpression(node)) return convertFunctionExpressionToNode(node, state);
	if (ts.isCallExpression(node)) return convertCallExpressionToNode(node, state);
	return undefined;
}

export function convertExpressionToNode(
	node: ts.Expression,
	state: IngestState,
): string {
	const literal = tryConvertLiteral(node, state);
	if (literal !== undefined) return literal;

	const operator = tryConvertOperator(node, state);
	if (operator !== undefined) return operator;

	const fnOrCall = tryConvertFnOrCall(node, state);
	if (fnOrCall !== undefined) return fnOrCall;

	return addLitNode(state, { kind: "void" }, null);
}
