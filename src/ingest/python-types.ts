// Python AST type definitions for the ingest pipeline

export interface PyNode {
	_type: string;
	[key: string]: unknown;
}

export interface PyModule {
	_type: "Module";
	body: PyNode[];
	[key: string]: unknown;
}

export interface PyExpr {
	_type: "Expr";
	value: PyNode;
	[key: string]: unknown;
}

export interface PyAssign {
	_type: "Assign";
	targets: PyNode[];
	value: PyNode;
	[key: string]: unknown;
}

export interface PyFunctionDef {
	_type: "FunctionDef";
	name: string;
	args: PyArguments;
	body: PyNode[];
	[key: string]: unknown;
}

export interface PyArguments {
	_type: "arguments";
	args: PyArg[];
	[key: string]: unknown;
}

export interface PyArg {
	_type: "arg";
	arg: string;
	[key: string]: unknown;
}

export interface PyReturn {
	_type: "Return";
	value: PyNode | null;
	[key: string]: unknown;
}

export interface PyIf {
	_type: "If";
	test: PyNode;
	body: PyNode[];
	orelse: PyNode[];
	[key: string]: unknown;
}

export interface PyWhile {
	_type: "While";
	test: PyNode;
	body: PyNode[];
	[key: string]: unknown;
}

export interface PyFor {
	_type: "For";
	target: PyNode;
	iter: PyNode;
	body: PyNode[];
	[key: string]: unknown;
}

export interface PyConstant {
	_type: "Constant";
	value: unknown;
	[key: string]: unknown;
}

export interface PyName {
	_type: "Name";
	id: string;
	[key: string]: unknown;
}

export interface PyBinOp {
	_type: "BinOp";
	left: PyNode;
	op: PyNode;
	right: PyNode;
	[key: string]: unknown;
}

export interface PyUnaryOp {
	_type: "UnaryOp";
	op: PyNode;
	operand: PyNode;
	[key: string]: unknown;
}

export interface PyBoolOp {
	_type: "BoolOp";
	op: PyNode;
	values: PyNode[];
	[key: string]: unknown;
}

export interface PyCompare {
	_type: "Compare";
	left: PyNode;
	ops: PyNode[];
	comparators: PyNode[];
	[key: string]: unknown;
}

export interface PyIfExp {
	_type: "IfExp";
	test: PyNode;
	body: PyNode;
	orelse: PyNode;
	[key: string]: unknown;
}

export interface PyLambda {
	_type: "Lambda";
	args: PyArguments;
	body: PyNode;
	[key: string]: unknown;
}

export interface PyCall {
	_type: "Call";
	func: PyNode;
	args: PyNode[];
	[key: string]: unknown;
}

// ---------- Type guards ----------

export function isAstNode(value: unknown): value is PyNode {
	if (typeof value !== "object" || value === null) return false;
	if (!("_type" in value)) return false;
	return typeof value._type === "string";
}

export function isModule(node: PyNode): node is PyModule {
	return node._type === "Module";
}

export function isValidPyModule(value: unknown): value is PyModule {
	if (!isAstNode(value)) return false;
	return value._type === "Module" && Array.isArray(value.body);
}

export function isExprStmt(node: PyNode): node is PyExpr {
	return node._type === "Expr";
}

export function isAssign(node: PyNode): node is PyAssign {
	return node._type === "Assign";
}

export function isFunctionDef(node: PyNode): node is PyFunctionDef {
	return node._type === "FunctionDef";
}

export function isReturn(node: PyNode): node is PyReturn {
	return node._type === "Return";
}

export function isIfStmt(node: PyNode): node is PyIf {
	return node._type === "If";
}

export function isWhileStmt(node: PyNode): node is PyWhile {
	return node._type === "While";
}

export function isForStmt(node: PyNode): node is PyFor {
	return node._type === "For";
}

export function isConstant(node: PyNode): node is PyConstant {
	return node._type === "Constant";
}

export function isName(node: PyNode): node is PyName {
	return node._type === "Name";
}

export function isBinOp(node: PyNode): node is PyBinOp {
	return node._type === "BinOp";
}

export function isUnaryOp(node: PyNode): node is PyUnaryOp {
	return node._type === "UnaryOp";
}

export function isBoolOp(node: PyNode): node is PyBoolOp {
	return node._type === "BoolOp";
}

export function isCompare(node: PyNode): node is PyCompare {
	return node._type === "Compare";
}

export function isIfExp(node: PyNode): node is PyIfExp {
	return node._type === "IfExp";
}

export function isLambdaExpr(node: PyNode): node is PyLambda {
	return node._type === "Lambda";
}

export function isCall(node: PyNode): node is PyCall {
	return node._type === "Call";
}

export function isPrintCall(node: PyCall): boolean {
	return isName(node.func) && node.func.id === "print";
}

export function isStringLiteral(node: PyNode): boolean {
	return isConstant(node) && typeof node.value === "string";
}
