/* eslint-disable @typescript-eslint/no-unused-vars */
// SPIRAL Python Ingest
// Stub for future Python source code ingestion

export interface PythonIngestOptions {
	/** Module name for the generated SPIRAL document */
	moduleName?: string;
	/** Target IR layer (default: "eir") */
	targetLayer?: "air" | "cir" | "eir" | "pir";
}

/**
 * Ingest Python source code and produce a SPIRAL document.
 *
 * @throws Always throws - Python ingest is not yet implemented.
 */
export function ingestPython(
	_source: string,
	_options?: PythonIngestOptions,
): never {
	throw new Error("Python ingest is not yet implemented");
}
