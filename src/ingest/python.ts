// SPIRAL Python Ingest
// Converts Python source code to SPIRAL IR documents (AIR/CIR/EIR)
// Uses Python's ast module via subprocess for parsing

import { execSync } from "node:child_process";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
} from "../types.js";
import type { IngestState, Layer } from "./types.js";
import { isValidPyModule, type PyModule } from "./python-types.js";
import { buildDocument } from "./helpers.js";
import { scanPythonFeatures } from "./python-scan.js";
import { convertModule } from "./python-convert.js";

//==============================================================================
// Public API
//==============================================================================

export interface PythonIngestOptions {
	/** Module name for the generated SPIRAL document */
	moduleName?: string;
	/** Target IR layer (default: auto-detect) */
	targetLayer?: "air" | "cir" | "eir";
	/** Document version */
	version?: string;
	/** Treat all numbers as float */
	floatNumbers?: boolean;
}

export function ingestPython(
	source: string,
	options?: PythonIngestOptions,
): AIRDocument | CIRDocument | EIRDocument {
	const pyAst = parsePythonAST(source);
	const layer = options?.targetLayer ?? scanPythonFeatures(pyAst.body);
	const version = options?.version ?? "1.0.0";

	const state = createState(layer, options?.floatNumbers ?? false);
	const result = convertModule(pyAst.body, state);

	return buildDocument({ layer, version, nodes: state.nodes, result });
}

//==============================================================================
// Python AST bridge
//==============================================================================

function buildBridgeScript(source: string): string {
	const encoded = Buffer.from(source).toString("base64");
	return [
		"import ast, json, base64",
		"",
		"def node_to_dict(node):",
		"    if isinstance(node, ast.AST):",
		"        result = {\"_type\": node.__class__.__name__}",
		"        for field, value in ast.iter_fields(node):",
		"            result[field] = node_to_dict(value)",
		"        return result",
		"    elif isinstance(node, list):",
		"        return [node_to_dict(x) for x in node]",
		"    else:",
		"        return node",
		"",
		`source = base64.b64decode("${encoded}").decode("utf-8")`,
		"tree = ast.parse(source)",
		"print(json.dumps(node_to_dict(tree)))",
	].join("\n");
}

function parsePythonAST(source: string): PyModule {
	const script = buildBridgeScript(source);
	const output = execSync("python3", {
		input: script,
		encoding: "utf-8",
		timeout: 10_000,
	});
	const parsed: unknown = JSON.parse(output.trim());
	if (!isValidPyModule(parsed)) {
		throw new Error("Python AST bridge returned invalid module structure");
	}
	return parsed;
}

//==============================================================================
// State
//==============================================================================

function createState(layer: Layer, floatNumbers: boolean): IngestState {
	return {
		nodes: [],
		nextSynthId: 0,
		usedIds: new Set(),
		layer,
		currentFunctionName: null,
		floatNumbers,
	};
}
