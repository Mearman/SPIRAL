// SPIRAL Python Synthesizer
// Translates SPIRAL documents (AIR/CIR/EIR/LIR) to executable Python code

import type {
	AIRDef, AIRDocument, CIRDocument, EIRDocument,
	Expr, EirExpr, Node, EirNode,
	LIRDocument, LirBlock,
	CallExpr, AirRefExpr, DoExpr, LitExpr, FixExpr,
	EirAssignExpr, EirEffectExpr,
	Value,
} from "../types.js";
import { isBlockNode, isExprNode } from "../types.js";

export interface PythonSynthOptions {
	moduleName?: string;
	typeHints?: boolean;
	debugComments?: boolean;
}

type Document = AIRDocument | CIRDocument | EIRDocument | LIRDocument;

interface OperatorMapping {
	pythonOp: string;
	customImpl?: (args: string[]) => string;
}

const OPERATOR_MAP: Record<string, OperatorMapping> = {
	"core:add": { pythonOp: "+" },
	"core:sub": { pythonOp: "-" },
	"core:mul": { pythonOp: "*" },
	"core:div": { pythonOp: "//", customImpl: (args) => `int(${args[0]} // ${args[1]})` },
	"core:mod": { pythonOp: "%" },
	"core:pow": { pythonOp: "**" },
	"core:neg": { pythonOp: "-", customImpl: (args) => `(-${args[0]})` },
	"core:eq": { pythonOp: "==" },
	"core:neq": { pythonOp: "!=" },
	"core:lt": { pythonOp: "<" },
	"core:lte": { pythonOp: "<=" },
	"core:gt": { pythonOp: ">" },
	"core:gte": { pythonOp: ">=" },
	"bool:and": { pythonOp: "and" },
	"bool:or": { pythonOp: "or" },
	"bool:not": { pythonOp: "not", customImpl: (args) => `(not ${args[0]})` },
	"list:length": { pythonOp: "len", customImpl: (args) => `len(${args[0]})` },
	"list:concat": { pythonOp: "+", customImpl: (args) => `(${args[0]} + ${args[1]})` },
	"string:concat": { pythonOp: "+", customImpl: (args) => `(${args[0]} + ${args[1]})` },
};

function isLIRDocument(doc: Document): doc is LIRDocument {
	return "nodes" in doc && doc.nodes.some((n) => "blocks" in n && "entry" in n);
}

function isExprBasedDocument(doc: Document): doc is AIRDocument | CIRDocument | EIRDocument {
	return "nodes" in doc && doc.nodes.some((n) => "expr" in n);
}

export function synthesizePython(doc: Document, opts: PythonSynthOptions = {}): string {
	const { moduleName = "spiral_generated" } = opts;
	if (isLIRDocument(doc)) return synthesizeLIR(doc, { moduleName });
	if (isExprBasedDocument(doc)) return synthesizeExprBased(doc, { moduleName });
	throw new Error("Unrecognized document format");
}

interface ExprSynthState {
	lines: string[];
	varIndex: number;
	airDefs: Map<string, AIRDef>;
}

interface ExprCtx {
	state: ExprSynthState;
	mutableCells: Map<string, string>;
	cellInitLines: string[];
}

function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function freshVar(state: ExprSynthState): string {
	return `_v${state.varIndex++}`;
}

function isValue(value: object): value is Value {
	return "kind" in value;
}

function ref(nodeId: string): string {
	return `v_${sanitizeId(nodeId)}`;
}

function refOrInline(ctx: ExprCtx, val: string | Expr | EirExpr): string {
	return typeof val === "string" ? ref(val) : synthesizeExpr(ctx, val);
}

function synthLit(expr: LitExpr): string {
	const rawValue = expr.value;
	if (rawValue === null || rawValue === undefined) return "None";
	if (typeof rawValue === "boolean") return rawValue ? "True" : "False";
	if (typeof rawValue === "string") return `"${rawValue}"`;
	if (typeof rawValue === "number") return String(rawValue);
	if (Array.isArray(rawValue)) return `[${rawValue.map((v: unknown) => formatUnknownValue(v)).join(", ")}]`;
	if (typeof rawValue === "object" && isValue(rawValue)) return formatLiteral(rawValue);
	return formatUnknownValue(rawValue);
}

function synthCall(ctx: ExprCtx, expr: CallExpr): string {
	const qualName = `${expr.ns}:${expr.name}`;
	const mapping = OPERATOR_MAP[qualName];
	if (!mapping) throw new Error(`Unsupported operator: ${qualName}`);
	const argCodes = expr.args.map(a => refOrInline(ctx, a));
	if (mapping.customImpl) return mapping.customImpl(argCodes);
	if (argCodes.length === 1) return `${mapping.pythonOp}${argCodes[0]}`;
	if (argCodes.length === 2) return `(${argCodes[0]} ${mapping.pythonOp} ${argCodes[1]})`;
	throw new Error(`Unexpected arity for ${qualName}: ${argCodes.length}`);
}

function synthAirRef(ctx: ExprCtx, expr: AirRefExpr): string {
	const qualName = `${expr.ns}:${expr.name}`;
	if (!ctx.state.airDefs.has(qualName)) throw new Error(`Unknown AIR definition: ${qualName}`);
	return `air_${expr.ns}_${expr.name}(${expr.args.map(ref).join(", ")})`;
}

function synthDo(ctx: ExprCtx, expr: DoExpr): string {
	if (expr.exprs.length === 0) return "None";
	const first = expr.exprs[0];
	if (expr.exprs.length === 1 && first !== undefined) return refOrInline(ctx, first);
	return `(${expr.exprs.map(e => refOrInline(ctx, e)).join(", ")})[-1]`;
}

function synthAssign(ctx: ExprCtx, expr: EirAssignExpr): string {
	const value = refOrInline(ctx, expr.value);
	if (!ctx.mutableCells.has(expr.target)) {
		const cellName = `_cell_${ctx.state.varIndex++}`;
		ctx.cellInitLines.push(`${cellName} = {"${expr.target}": ${value}}`);
		ctx.mutableCells.set(expr.target, cellName);
	}
	return "None";
}

function synthEffect(ctx: ExprCtx, expr: EirEffectExpr): string {
	return `print("${expr.op}", ${expr.args.map(a => refOrInline(ctx, a)).join(", ")})`;
}

function synthFix(ctx: ExprCtx, expr: FixExpr): string {
	const v = freshVar(ctx.state);
	return `(lambda ${v}: ${ref(expr.fn)}(${v}))(${v})`;
}

function synthEirExpr(ctx: ExprCtx, expr: Expr | EirExpr): string | null {
	switch (expr.kind) {
	case "spawn":
		return `asyncio.create_task(${ref(expr.task)}())`;
	case "await":
		return `await ${ref(expr.future)}`;
	case "par":
		return `await asyncio.gather(${expr.branches.map(ref).join(", ")})`;
	case "channel":
		return `asyncio.Queue(${expr.bufferSize ? refOrInline(ctx, expr.bufferSize) : "0"})`;
	case "send":
		return `await ${ref(expr.channel)}.put(${refOrInline(ctx, expr.value)})`;
	case "recv":
		return `await ${ref(expr.channel)}.get()`;
	case "select":
	case "race":
		return `await asyncio.wait([${("futures" in expr ? expr.futures : expr.tasks).map(ref).join(", ")}], return_when=asyncio.FIRST_COMPLETED)`;
	default:
		return null;
	}
}

function synthSimpleKind(ctx: ExprCtx, expr: Expr | EirExpr): string | null {
	switch (expr.kind) {
	case "ref": return ref(expr.id);
	case "var": return expr.name;
	case "if": return `(${ref(expr.then)} if ${ref(expr.cond)} else ${ref(expr.else)})`;
	case "let": return `(lambda ${expr.name}: ${ref(expr.body)})(${ref(expr.value)})`;
	case "lambda": return `(lambda ${expr.params.join(", ")}: ${ref(expr.body)})`;
	case "callExpr": return `${ref(expr.fn)}(${expr.args.map(ref).join(", ")})`;
	case "predicate": return `(lambda ${expr.name}: True)`;
	case "while": return `(lambda _: (${refOrInline(ctx, expr.body)}, None)[1] if ${refOrInline(ctx, expr.cond)} else None)(None)`;
	case "iter": return `[(lambda ${expr.var}: ${refOrInline(ctx, expr.body)})(item) for item in ${refOrInline(ctx, expr.iter)}][-1]`;
	default: return null;
	}
}

function synthesizeExpr(ctx: ExprCtx, expr: Expr | EirExpr): string {
	switch (expr.kind) {
	case "lit": return synthLit(expr);
	case "call": return synthCall(ctx, expr);
	case "airRef": return synthAirRef(ctx, expr);
	case "do": return synthDo(ctx, expr);
	case "assign": return synthAssign(ctx, expr);
	case "effect": return synthEffect(ctx, expr);
	case "fix": return synthFix(ctx, expr);
	case "seq": return `(lambda _: ${refOrInline(ctx, expr.then)})(${refOrInline(ctx, expr.first)})`;
	default: return synthEirExpr(ctx, expr) ?? synthSimpleKind(ctx, expr) ?? (() => { throw new Error(`Unsupported expression kind: ${expr.kind}`); })();
	}
}

function initState(doc: AIRDocument | CIRDocument | EIRDocument, moduleName: string): ExprSynthState {
	const state: ExprSynthState = { lines: [], varIndex: 0, airDefs: new Map() };
	const airDefs = doc.airDefs ?? [];
	for (const airDef of airDefs) state.airDefs.set(`${airDef.ns}:${airDef.name}`, airDef);
	state.lines.push("# Generated by SPIRAL Python Synthesizer", `# Module: ${moduleName}`);
	state.lines.push(`# Document version: ${doc.version}`, "# IR Layer: expression-based", "");
	return state;
}

function emitNodeBinding(ctx: ExprCtx, node: Node | EirNode): void {
	const varName = `v_${sanitizeId(node.id)}`;
	if (ctx.state.lines.some((l) => l.startsWith(`${varName} =`))) return;
	ctx.state.lines.push(`${varName} = ${synthesizeExpr(ctx, node.expr)}`, "");
}

function emitAirDefs(state: ExprSynthState, airDefs: AIRDef[]): void {
	state.lines.push("# AIR definitions");
	for (const airDef of airDefs) {
		state.lines.push(`def air_${airDef.ns}_${airDef.name}(${airDef.params.join(", ")}):`);
		state.lines.push(`    return ${pythonExpr(airDef.body)}`, "");
	}
}

function insertMutableCells(lines: string[], cellInitLines: string[]): void {
	if (cellInitLines.length === 0) return;
	const idx = lines.findIndex((l) => l.startsWith("# Node bindings"));
	if (idx >= 0) lines.splice(idx, 0, "# Mutable cells", ...cellInitLines.map((l) => `    ${l}`), "");
}

function emitNodeBindings(state: ExprSynthState, doc: AIRDocument | CIRDocument | EIRDocument): ExprCtx {
	state.lines.push("# Node bindings");
	const ctx: ExprCtx = { state, mutableCells: new Map(), cellInitLines: [] };
	for (const node of doc.nodes) { if (isExprNode(node)) emitNodeBinding(ctx, node); }
	return ctx;
}

function synthesizeExprBased(doc: AIRDocument | CIRDocument | EIRDocument, opts: PythonSynthOptions): string {
	const state = initState(doc, opts.moduleName ?? "spiral_generated");
	const airDefs = doc.airDefs ?? [];
	if (airDefs.length > 0) { emitAirDefs(state, airDefs); state.lines.push(""); }
	const ctx = emitNodeBindings(state, doc);
	// Add asyncio import if async expressions are detected
	const asyncKinds = new Set(["spawn", "await", "par", "channel", "send", "recv", "select", "race"]);
	if (doc.nodes.some(n => "expr" in n && n.expr && typeof n.expr === "object" && "kind" in n.expr && asyncKinds.has(n.expr.kind))) {
		state.lines.splice(state.lines.indexOf("# Node bindings"), 0, "import asyncio", "");
	}
	insertMutableCells(state.lines, ctx.cellInitLines);
	state.lines.push("", "# Result", `print(v_${sanitizeId(doc.result)})`, "");
	return state.lines.join("\n");
}

function emitLirHeader(lines: string[], doc: LIRDocument, moduleName: string): void {
	lines.push("# Generated by SPIRAL Python Synthesizer", `# Module: ${moduleName}`);
	lines.push(`# Document version: ${doc.version}`, "# IR Layer: LIR (CFG-based)");
	lines.push("", "from typing import Dict, Any", "");
}

function emitLirBlocks(lines: string[], blocks: LirBlock[]): void {
	lines.push("# Blocks", "blocks = {");
	for (const block of blocks) {
		lines.push(`    "${block.id}": {`);
		lines.push(`        "instructions": ${JSON.stringify(block.instructions).replace(/"/g, '\\"')},`);
		lines.push(`        "terminator": ${JSON.stringify(block.terminator).replace(/"/g, '\\"')}`);
		lines.push("    },");
	}
	lines.push("}", "");
}

const LIR_ENGINE_LINES = [
	"# Execution engine", "def execute_lir(blocks, entry):",
	"    vars = {}", "    current = entry", "    predecessor = None", "",
	"    while True:", "        if current not in blocks:",
	"            raise RuntimeError(f\"Unknown block: {current}\")", "",
	"        block = blocks[current]", "",
	"        for inst in block['instructions']:", "            kind = inst['kind']", "",
	"            if kind == 'assign':", "                vars[inst['target']] = eval_value(inst['value'], vars)", "",
	"            elif kind == 'op':", "                vars[inst['target']] = apply_operator(inst['ns'], inst['name'], [vars[a] for a in inst['args']])", "",
	"            elif kind == 'phi':", "                source_id = None",
	"                for s in inst['sources']:", "                    if s['block'] == predecessor:",
	"                        source_id = s['id']", "                        break",
	"                vars[inst['target']] = vars[source_id]", "",
	"        term = block['terminator']", "",
	"        if term['kind'] == 'jump':", "            predecessor = current", "            current = term['to']", "",
	"        elif term['kind'] == 'branch':", "            predecessor = current",
	"            current = term['then'] if vars[term['cond']] else term['else']", "",
	"        elif term['kind'] == 'return':", "            return vars.get(term.get('value', ''), None)", "",
	"        elif term['kind'] == 'exit':", "            return vars.get(term.get('code', ''), 0)", "", "",
];

const LIR_HELPER_LINES = [
	"def eval_value(val, vars):", "    if isinstance(val, dict):", "        kind = val.get('kind')",
	"        if kind == 'lit':", "            return val['value']",
	"        elif kind == 'var':", "            return vars[val['name']]", "    return val", "",
	"def apply_operator(ns, name, args):", "    if ns == 'core' and name == 'add': return args[0] + args[1]",
	"    if ns == 'core' and name == 'sub': return args[0] - args[1]", "    if ns == 'core' and name == 'mul': return args[0] * args[1]",
	"    if ns == 'core' and name == 'div': return int(args[0] // args[1])", "    raise RuntimeError(f\"Unknown operator: {ns}:{name}\")", "", "",
];

function synthesizeLIR(doc: LIRDocument, opts: PythonSynthOptions): string {
	const lines: string[] = [];
	emitLirHeader(lines, doc, opts.moduleName ?? "spiral_generated");
	const resultNode = doc.nodes.find((n) => n.id === doc.result);
	if (!resultNode || !isBlockNode(resultNode)) throw new Error("LIR document result must be a block node");
	emitLirBlocks(lines, resultNode.blocks);
	lines.push(...LIR_ENGINE_LINES, ...LIR_HELPER_LINES);
	lines.push("if __name__ == \"__main__\":");
	lines.push(`    result = execute_lir(blocks, "${resultNode.entry}")`, "    print(result)");
	return lines.join("\n");
}

function formatLitKind(value: Value): string | null {
	switch (value.kind) {
	case "void": return "None";
	case "bool": return value.value ? "True" : "False";
	case "string": return `"${value.value}"`;
	case "int": case "float": return String(value.value);
	case "opaque": return `"<opaque:${value.name}>";`;
	case "error": return `"<error:${value.code}>";`;
	default: return null;
	}
}

function formatLitCollection(value: Value): string | null {
	switch (value.kind) {
	case "list": return `[${value.value.map(formatLiteral).join(", ")}]`;
	case "set": return `set([${Array.from(value.value).map((s) => JSON.stringify(s)).join(", ")}])`;
	case "map": return `{${Array.from(value.value.entries()).map(([k, v]) => `${JSON.stringify(k)}: ${formatLiteral(v)}`).join(", ")}}`;
	case "option": return value.value === null ? "None" : formatLiteral(value.value);
	default: return null;
	}
}

function formatLiteral(value: Value): string {
	if (Array.isArray(value)) return `[${value.map(formatLiteral).join(", ")}]`;
	return formatLitKind(value) ?? formatLitCollection(value) ?? `"<unknown:${value.kind}>"`;
}

function formatUnknownValue(value: unknown): string {
	if (value === null || value === undefined) return "None";
	if (typeof value === "boolean") return value ? "True" : "False";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return `"${value}"`;
	if (Array.isArray(value)) return `[${value.map(formatUnknownValue).join(", ")}]`;
	if (typeof value === "object" && isValue(value)) return formatLiteral(value);
	return JSON.stringify(value);
}

function pythonExprCall(expr: CallExpr): string {
	const qualName = `${expr.ns}:${expr.name}`;
	const mapping = OPERATOR_MAP[qualName];
	if (!mapping) return "None";
	const argCodes = expr.args.map((arg) => typeof arg === "string" ? `v_${sanitizeId(arg)}` : pythonExpr(arg));
	if (mapping.customImpl) return mapping.customImpl(argCodes);
	if (argCodes.length === 1) return `${mapping.pythonOp}${argCodes[0]}`;
	if (argCodes.length === 2) return `(${argCodes[0]} ${mapping.pythonOp} ${argCodes[1]})`;
	return "None";
}

function pythonExpr(expr: Expr): string {
	switch (expr.kind) {
	case "ref": return `v_${sanitizeId(expr.id)}`;
	case "var": return expr.name;
	case "lit": {
		const v = expr.value;
		if (typeof v === "object" && v !== null && isValue(v)) return formatLiteral(v);
		return formatUnknownValue(v);
	}
	case "call": return pythonExprCall(expr);
	default: return "None";
	}
}
