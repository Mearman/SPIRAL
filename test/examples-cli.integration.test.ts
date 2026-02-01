// Smoke tests for the examples CLI tool

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const CLI = resolve(import.meta.dirname, "..", "examples", "cli.ts");

function run(...args: string[]): Promise<{ stdout: string; stderr: string }> {
	return exec("tsx", [CLI, ...args], { timeout: 30_000 });
}

describe("Examples CLI", () => {
	it("lists examples without error", async () => {
		const { stdout } = await run("--list");
		assert.ok(stdout.includes("AIR"), "should list AIR examples");
		assert.ok(stdout.includes("EIR"), "should list EIR examples");
	});

	it("validates all examples", async () => {
		const { stdout } = await run("--validate", "--list");
		assert.ok(stdout.length > 0, "should produce output");
	});

	it("runs an AIR example", async () => {
		const { stdout } = await run("air/basics/arithmetic");
		assert.ok(stdout.includes("Result"), "should show result");
	});

	it("runs an EIR example", async () => {
		const { stdout } = await run("eir/basics/sequencing");
		assert.ok(stdout.includes("Result"), "should show result");
	});

	it("runs a LIR example", async () => {
		const { stdout } = await run("lir/basics/straight-line");
		assert.ok(stdout.includes("Result"), "should show result");
	});
});
