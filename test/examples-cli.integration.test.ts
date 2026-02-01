// Smoke tests for the examples CLI tool
// Discovers all examples and runs each through the CLI

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "examples", "cli.ts");

function run(...args: string[]): Promise<{ stdout: string; stderr: string }> {
	return exec("tsx", [CLI, ...args], { timeout: 30_000 });
}

function discoverExamples(): { path: string; relativePath: string }[] {
	const pattern = "examples/**/*.{air,cir,eir,lir}.json";
	const files = globSync(pattern, { cwd: ROOT, absolute: true });
	return files.map((filePath) => {
		const rel = relative(resolve(ROOT, "examples"), filePath);
		const cliPath = rel.replace(/\.(air|cir|eir|lir)\.json$/, "");
		return { path: cliPath, relativePath: rel };
	});
}

describe("Examples CLI", () => {
	it("lists examples without error", async () => {
		const { stdout } = await run("--list");
		assert.ok(stdout.includes("AIR"), "should list AIR examples");
		assert.ok(stdout.includes("CIR"), "should list CIR examples");
		assert.ok(stdout.includes("EIR"), "should list EIR examples");
		assert.ok(stdout.includes("LIR"), "should list LIR examples");
	});

	const examples = discoverExamples();

	for (const example of examples) {
		it(`runs ${example.relativePath}`, async () => {
			const { stdout } = await run(example.path);
			assert.ok(
				stdout.includes("Result") || stdout.includes("Validation passed"),
				`expected CLI output for ${example.relativePath}`,
			);
		});
	}
});
