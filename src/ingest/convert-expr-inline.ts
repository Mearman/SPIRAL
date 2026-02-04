// Expression conversion -- Inline mode
// Returns inline Expr objects for use inside lambda bodies.

import ts from "typescript";
import type { Type } from "../types.ts";
import type { IngestState } from "./types.ts";
import { getBinaryOpMapping, makeVoidExpr } from "./helpers.ts";
import { convertExpressionToNode } from "./convert-expr-node.ts";

function convertNumericInline(
	node: ts.NumericLiteral,
	state: IngestState,
): unknown {
	const value = Number(node.text);
	const isFloat =
		state.floatNumbers ||
		node.text.includes(".") ||
		node.text.includes("e") ||
		node.text.includes("E");
	const type: Type = isFloat ? { kind: "float" } : { kind: "int" };
	return { kind: "lit", type, value };
}

function convertIdentifierInline(
	node: ts.Identifier,
	params: string[],
): unknown {
	if (params.includes(node.text)) {
		return { kind: "var", name: node.text };
	}
	return { kind: "ref", id: node.text };
}

function convertBinaryExprInline(
	node: ts.BinaryExpression,
	state: IngestState,
	params: string[],
): unknown {
	const op = node.operatorToken.kind;

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

	return makeVoidExpr();
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

function convertConsoleCallInline(
	node: ts.CallExpression,
	state: IngestState,
	params: string[],
): unknown {
	if (
		!ts.isPropertyAccessExpression(node.expression) ||
		!ts.isIdentifier(node.expression.expression) ||
		node.expression.expression.text !== "console"
	) {
		return undefined;
	}
	const argExprs = node.arguments.map((a) =>
		convertExprInline(a, state, params),
	);
	return { kind: "effect", op: "print", args: argExprs };
}

function convertCallExprInline(
	node: ts.CallExpression,
	state: IngestState,
	params: string[],
): unknown {
	const consoleResult = convertConsoleCallInline(node, state, params);
	if (consoleResult !== undefined) return consoleResult;

	if (ts.isIdentifier(node.expression)) {
		const argExprs = node.arguments.map((a) =>
			convertExprInline(a, state, params),
		);
		return { kind: "callExpr", fn: node.expression.text, args: argExprs };
	}

	const fnExpr = convertExprInline(node.expression, state, params);
	const argExprs = node.arguments.map((a) =>
		convertExprInline(a, state, params),
	);
	return { kind: "callExpr", fn: fnExpr, args: argExprs };
}

function concatInline(left: unknown, right: unknown): unknown {
	return { kind: "call", ns: "string", name: "concat", args: [left, right] };
}

function convertTemplateSpanInline(
	span: ts.TemplateSpan,
	state: IngestState,
	params: string[],
): unknown {
	return convertExprInline(span.expression, state, params);
}

function convertTemplateExprInline(
	node: ts.TemplateExpression,
	state: IngestState,
	params: string[],
): unknown {
	let current: unknown = {
		kind: "lit",
		type: { kind: "string" },
		value: node.head.text,
	};

	for (const span of node.templateSpans) {
		const spanExpr = convertTemplateSpanInline(span, state, params);
		current = concatInline(current, spanExpr);

		if (span.literal.text.length > 0) {
			const tailLit = { kind: "lit", type: { kind: "string" }, value: span.literal.text };
			current = concatInline(current, tailLit);
		}
	}

	return current;
}

// Inline converters for literals and simple expressions
function tryConvertLiteral(node: ts.Expression, state: IngestState): unknown {
	if (ts.isNumericLiteral(node)) return convertNumericInline(node, state);
	if (ts.isStringLiteral(node)) return { kind: "lit", type: { kind: "string" }, value: node.text };
	if (ts.isNoSubstitutionTemplateLiteral(node)) return { kind: "lit", type: { kind: "string" }, value: node.text };
	if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: "lit", type: { kind: "bool" }, value: true };
	if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "lit", type: { kind: "bool" }, value: false };
	return undefined;
}

function tryConvertCompound(
	node: ts.Expression,
	state: IngestState,
	params: string[],
): unknown {
	if (ts.isIdentifier(node)) return convertIdentifierInline(node, params);
	if (ts.isParenthesizedExpression(node)) return convertExprInline(node.expression, state, params);
	if (ts.isBinaryExpression(node)) return convertBinaryExprInline(node, state, params);
	if (ts.isPrefixUnaryExpression(node)) return convertPrefixUnaryInline(node, state, params);
	if (ts.isConditionalExpression(node)) return convertConditionalInline(node, state);
	if (ts.isCallExpression(node)) return convertCallExprInline(node, state, params);
	if (ts.isTemplateExpression(node)) return convertTemplateExprInline(node, state, params);
	return undefined;
}

export function convertExprInline(
	node: ts.Expression,
	state: IngestState,
	params: string[],
): unknown {
	const literal = tryConvertLiteral(node, state);
	if (literal !== undefined) return literal;

	const compound = tryConvertCompound(node, state, params);
	if (compound !== undefined) return compound;

	return makeVoidExpr();
}
