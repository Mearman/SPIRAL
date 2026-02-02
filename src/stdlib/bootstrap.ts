// SPIRAL Stdlib Bootstrap
// Initializes kernel + loads stdlib CIR documents → full operator registry.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { type OperatorRegistry } from "../domains/registry.js";
import { createKernelRegistry } from "./kernel.js";
import { loadStdlib } from "./loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Bootstrap the full SPIRAL operator registry.
 * Loads kernel (native) operators, then stdlib CIR documents.
 */
export function bootstrapRegistry(): OperatorRegistry {
	const kernel = createKernelRegistry();

	// Collect stdlib paths in dependency order
	const stdlibFiles = [
		"bool.cir.json",
		"list.cir.json",
		"string.cir.json",
		"core-derived.cir.json",
		"map.cir.json",
		"set.cir.json",
		"conversion.cir.json",
		"list-hof.cir.json",
		"validate.cir.json",
		"schema.cir.json",
		"parse.cir.json",
		"typecheck.cir.json",
		"meta.cir.json",
		"optimize-dce.cir.json",
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
