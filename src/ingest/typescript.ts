// SPIRAL TypeScript Ingest Converter
// Converts TypeScript source code to SPIRAL IR documents (AIR/CIR/EIR/PIR)
// Two-pass architecture: feature scan (layer selection) then AST conversion

import ts from "typescript";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	PIRDocument,
} from "../types.js";
import type { IngestState } from "./types.js";
import { scanFeatures } from "./scan.js";
import { buildDocument, freshId, addNode } from "./helpers.js";
import { convertNode } from "./convert-node.js";

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
	const sourceFile = parseSource(source);
	const layer = options?.forceLayer ?? scanFeatures(sourceFile);
	const version =
		options?.version ?? (layer === "pir" ? "2.0.0" : "1.0.0");

	const state = createState(layer, options?.floatNumbers ?? false);
	const result = convertTopLevel(sourceFile, state);

	return buildDocument({ layer, version, nodes: state.nodes, result });
}

//==============================================================================
// Private helpers
//==============================================================================

function parseSource(source: string): ts.SourceFile {
	return ts.createSourceFile(
		"input.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
}

function createState(
	layer: "air" | "cir" | "eir" | "pir",
	floatNumbers: boolean,
): IngestState {
	return {
		nodes: [],
		nextSynthId: 0,
		usedIds: new Set(),
		layer,
		currentFunctionName: null,
		floatNumbers,
	};
}

function convertTopLevel(
	sourceFile: ts.SourceFile,
	state: IngestState,
): string {
	let lastId: string | undefined;
	ts.forEachChild(sourceFile, (child) => {
		const id = convertNode(child, state);
		if (id !== undefined) lastId = id;
	});

	if (lastId !== undefined) return lastId;

	const emptyId = "_e_empty";
	addNode(state, emptyId, {
		kind: "lit",
		type: { kind: "void" },
		value: null,
	});
	freshId(state, emptyId);
	return emptyId;
}
