// Pass 1: Feature Scan — determines minimum IR layer for the source

import ts from "typescript";
import type { Layer } from "./types.js";

const LAYER_ORDER: Record<Layer, number> = {
	air: 0,
	cir: 1,
	eir: 2,
};

function maxLayer(a: Layer, b: Layer): Layer {
	return LAYER_ORDER[a] >= LAYER_ORDER[b] ? a : b;
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

// ---------- per-category detectors ----------

function detectAsync(node: ts.Node): boolean {
	if (
		ts.isFunctionDeclaration(node) &&
		node.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.AsyncKeyword,
		)
	) {
		return true;
	}
	if (ts.isAwaitExpression(node)) return true;
	if (
		ts.isArrowFunction(node) &&
		node.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.AsyncKeyword,
		)
	) {
		return true;
	}
	return false;
}

function detectEir(
	node: ts.Node,
	sourceFile: ts.SourceFile,
): boolean {
	if (ts.isVariableDeclaration(node)) {
		const declList = node.parent;
		if (
			ts.isVariableDeclarationList(declList) &&
			!(declList.flags & ts.NodeFlags.Const)
		) {
			const name = node.name.getText();
			if (hasReassignment(sourceFile, name)) return true;
		}
	}
	if (isLoopStatement(node)) return true;
	if (ts.isTryStatement(node)) return true;
	if (isConsoleCall(node)) return true;
	return false;
}

function isLoopStatement(node: ts.Node): boolean {
	return (
		ts.isWhileStatement(node) ||
		ts.isForStatement(node) ||
		ts.isForOfStatement(node) ||
		ts.isForInStatement(node)
	);
}

function isConsoleCall(node: ts.Node): boolean {
	if (!ts.isCallExpression(node)) return false;
	const callExpr = node.expression;
	return (
		ts.isPropertyAccessExpression(callExpr) &&
		ts.isIdentifier(callExpr.expression) &&
		callExpr.expression.text === "console"
	);
}

function detectCir(node: ts.Node): boolean {
	if (ts.isArrowFunction(node)) return true;
	if (ts.isFunctionDeclaration(node)) return true;
	if (ts.isFunctionExpression(node)) return true;
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		return true;
	}
	return false;
}

export function scanFeatures(sourceFile: ts.SourceFile): Layer {
	let layer: Layer = "air";

	function visit(node: ts.Node): void {
		if (detectAsync(node)) {
			layer = "eir";
			return;
		}
		if (detectEir(node, sourceFile)) {
			layer = maxLayer(layer, "eir");
		}
		if (layer !== "eir" && detectCir(node)) {
			layer = maxLayer(layer, "cir");
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return layer;
}
