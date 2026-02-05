// SPIRAL Stdlib Bootstrap
// Initializes kernel + loads stdlib CIR documents → full operator registry.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { type OperatorRegistry } from "../domains/registry.ts";
import { createKernelRegistry } from "./kernel.ts";
import { loadStdlib } from "./loader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Bootstrap the full SPIRAL operator registry.
 * Loads kernel (native) operators, then stdlib CIR documents.
 */
export function bootstrapRegistry(): OperatorRegistry {
	const kernel = createKernelRegistry();

	// Collect stdlib paths in dependency order
	const stdlibFiles = [
		"constants.cir.json",
		"bool.cir.json",
		"list.cir.json",
		"string.cir.json",
		"core-derived.cir.json",
		"map.cir.json",
		"set.cir.json",
		"conversion.cir.json",
		"list-hof.cir.json",
		"registry.cir.json",
		"effects.cir.json",
		"validate.cir.json",
		"schema.cir.json",
		"parse.cir.json",
		"typecheck.cir.json",
		"meta.cir.json",
		"desugar-shorthands.cir.json",
		"desugar.cir.json",
		"optimize-dce.cir.json",
		"optimize-fold.cir.json",
		"synth.cir.json",
		"synth-typescript.cir.json",
		// EIR stdlib - must be loaded after base stdlib
		"eir-state.cir.json",
		"eir-seq.cir.json",
		"eir-assign.cir.json",
		"eir-while.cir.json",
		"eir-for.cir.json",
		"eir-iter.cir.json",
		"eir-effect.cir.json",
		"eir-refcell.cir.json",
		"eir-try.cir.json",
		// Note: eir-async.cir.json excluded - stub implementation not needed for core EIR tests
		"eir.cir.json",
		// Metaprogramming stdlib - AST, graph, error handling, substitution, bound-nodes
		"error-handling.cir.json",
		"ast-metaprogramming.cir.json",
		"graph-traversal.cir.json",
		// "substitution.cir.json", // TODO: Fix forward reference issue
		// "bound-nodes.cir.json", // TODO: Fix inline lambda body expressions
	];

	const paths: string[] = [];
	for (const file of stdlibFiles) {
		const p = resolve(__dirname, file);
		if (existsSync(p)) paths.push(p);
	}

	if (paths.length === 0) return kernel;
	return loadStdlib(kernel, paths);
}

export { createKernelRegistry };
