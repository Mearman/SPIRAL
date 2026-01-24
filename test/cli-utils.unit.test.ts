// SPDX-License-Identifier: MIT
// SPIRAL CLI Utilities - Unit Tests

import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	parseInputString,
	readInputsFile,
	parseArgs,
	type Options,
} from "../src/cli-utils.js";

//==============================================================================
// Test Fixtures
//==============================================================================

const defaultOptions: Options = {
	verbose: false,
	validate: false,
	help: false,
	list: false,
	synth: false,
};

//==============================================================================
// Test Suite
//==============================================================================

describe("CLI Utils - Unit Tests", () => {

	//==========================================================================
	// parseInputString Tests
	//==========================================================================

	describe("parseInputString", () => {

		it("should parse comma-separated numbers", () => {
			const result = parseInputString("1,2,3");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should parse comma-separated strings", () => {
			const result = parseInputString("hello,world,test");
			assert.deepStrictEqual(result, ["hello", "world", "test"]);
		});

		it("should parse mixed comma-separated values", () => {
			const result = parseInputString("1,two,3,four");
			assert.deepStrictEqual(result, [1, "two", 3, "four"]);
		});

		it("should handle whitespace around comma-separated values", () => {
			const result = parseInputString("1, two , 3 , four");
			assert.deepStrictEqual(result, [1, "two", 3, "four"]);
		});

		it("should parse JSON array of numbers", () => {
			const result = parseInputString("[1, 2, 3]");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should parse JSON array of strings", () => {
			const result = parseInputString('["hello", "world", "test"]');
			assert.deepStrictEqual(result, ["hello", "world", "test"]);
		});

		it("should parse JSON array with mixed types", () => {
			const result = parseInputString('[1, "two", 3, "four"]');
			assert.deepStrictEqual(result, [1, "two", 3, "four"]);
		});

		it("should parse JSON array with nested objects as strings", () => {
			const result = parseInputString('[1, {"a": 2}, "test"]');
			// Objects are converted to string via String() which gives "[object Object]"
			assert.deepStrictEqual(result, [1, "[object Object]", "test"]);
		});

		it("should handle single value", () => {
			const result = parseInputString("42");
			assert.deepStrictEqual(result, [42]);
		});

		it("should handle single string value", () => {
			const result = parseInputString("hello");
			assert.deepStrictEqual(result, ["hello"]);
		});

		it("should handle empty string", () => {
			const result = parseInputString("");
			assert.deepStrictEqual(result, [""]);
		});

		it("should handle comma-separated with empty values", () => {
			const result = parseInputString("1,,3");
			assert.deepStrictEqual(result, [1, "", 3]);
		});

		it("should handle whitespace-only values", () => {
			const result = parseInputString("  ,  ,  ");
			assert.deepStrictEqual(result, ["", "", ""]);
		});

		it("should handle JSON empty array", () => {
			const result = parseInputString("[]");
			assert.deepStrictEqual(result, []);
		});

		it("should handle JSON array with booleans converted to strings", () => {
			const result = parseInputString("[true, false, null]");
			assert.deepStrictEqual(result, ["true", "false", "null"]);
		});

		it("should handle scientific notation numbers", () => {
			const result = parseInputString("1e5,2.5e-3");
			assert.deepStrictEqual(result, [1e5, 2.5e-3]);
		});

		it("should handle decimal numbers in comma-separated format", () => {
			const result = parseInputString("1.5,2.75,3.99");
			assert.deepStrictEqual(result, [1.5, 2.75, 3.99]);
		});

		it("should handle negative numbers", () => {
			const result = parseInputString("-1,-2,-3");
			assert.deepStrictEqual(result, [-1, -2, -3]);
		});

		it("should handle JSON array with decimals", () => {
			const result = parseInputString("[1.5, 2.75, 3.99]");
			assert.deepStrictEqual(result, [1.5, 2.75, 3.99]);
		});

		it("should treat non-numeric strings as strings", () => {
			const result = parseInputString("abc,def,ghi");
			assert.deepStrictEqual(result, ["abc", "def", "ghi"]);
		});

		it("should handle alphanumeric strings", () => {
			const result = parseInputString("test123,abc456");
			assert.deepStrictEqual(result, ["test123", "abc456"]);
		});

		it("should handle strings that look like numbers but have leading zeros", () => {
			const result = parseInputString("01,02,03");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should handle JSON object as string (not array)", () => {
			const result = parseInputString('{"key": "value"}');
			// When it's not an array, fall back to comma-separated
			assert.deepStrictEqual(result, ['{"key": "value"}']);
		});

		it("should handle invalid JSON by falling back to comma-separated", () => {
			const result = parseInputString("[invalid json");
			assert.deepStrictEqual(result, ["[invalid json"]);
		});
	});

	//==========================================================================
	// readInputsFile Tests
	//==========================================================================

	describe("readInputsFile", () => {
		let testDir: string;
		let testFilePath: string;

		before(async () => {
			testDir = join(tmpdir(), `cli-utils-test-${Date.now()}`);
			await mkdir(testDir, { recursive: true });
			testFilePath = join(testDir, "inputs.json");
		});

		after(async () => {
			try {
				await unlink(testFilePath);
			} catch {
				// File might not exist
			}
			try {
				await unlink(testDir);
			} catch {
				// Directory might not be empty or exist
			}
		});

		it("should read JSON array of numbers from file", async () => {
			const content = JSON.stringify([1, 2, 3]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should read JSON array of strings from file", async () => {
			const content = JSON.stringify(["hello", "world", "test"]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, ["hello", "world", "test"]);
		});

		it("should read JSON array with mixed types from file", async () => {
			const content = JSON.stringify([1, "two", 3, "four"]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, [1, "two", 3, "four"]);
		});

		it("should read empty JSON array from file", async () => {
			const content = JSON.stringify([]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, []);
		});

		it("should return null for non-existent file", async () => {
			const result = await readInputsFile("/nonexistent/path/file.json");
			assert.strictEqual(result, null);
		});

		it("should return null for invalid JSON", async () => {
			const content = "{ invalid json }";
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.strictEqual(result, null);
		});

		it("should return null for JSON object (not array)", async () => {
			const content = JSON.stringify({ key: "value" });
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.strictEqual(result, null);
		});

		it("should return null for JSON primitive", async () => {
			const content = JSON.stringify("just a string");
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.strictEqual(result, null);
		});

		it("should handle JSON with whitespace", async () => {
			const content = "  [1, 2, 3]  ";
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should convert boolean values to strings", async () => {
			const content = JSON.stringify([true, false]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, ["true", "false"]);
		});

		it("should convert null to string", async () => {
			const content = JSON.stringify([null]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			assert.deepStrictEqual(result, ["null"]);
		});

		it("should handle nested arrays", async () => {
			const content = JSON.stringify([1, [2, 3], "test"]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			// Nested array is converted to string "2,3"
			assert.deepStrictEqual(result, [1, "2,3", "test"]);
		});

		it("should handle nested objects as strings", async () => {
			const content = JSON.stringify([1, { a: 2 }, "test"]);
			await writeFile(testFilePath, content, "utf-8");
			const result = await readInputsFile(testFilePath);
			// Objects are converted to string via String() which gives "[object Object]"
			assert.deepStrictEqual(result, [1, "[object Object]", "test"]);
		});
	});

	//==========================================================================
	// parseArgs Tests
	//==========================================================================

	describe("parseArgs", () => {

		it("should parse empty args", () => {
			const result = parseArgs([]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions },
			});
		});

		it("should parse positional path argument", () => {
			const result = parseArgs(["/some/path"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions },
			});
		});

		it("should parse --verbose flag", () => {
			const result = parseArgs(["--verbose"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true },
			});
		});

		it("should parse -v flag as verbose", () => {
			const result = parseArgs(["-v"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true },
			});
		});

		it("should parse --validate flag", () => {
			const result = parseArgs(["--validate"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, validate: true },
			});
		});

		it("should parse --help flag", () => {
			const result = parseArgs(["--help"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, help: true },
			});
		});

		it("should parse -h flag as help", () => {
			const result = parseArgs(["-h"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, help: true },
			});
		});

		it("should parse --list flag", () => {
			const result = parseArgs(["--list"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, list: true },
			});
		});

		it("should parse -l flag as list", () => {
			const result = parseArgs(["-l"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, list: true },
			});
		});

		it("should parse --synth flag", () => {
			const result = parseArgs(["--synth"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, synth: true },
			});
		});

		it("should parse --inputs option with value", () => {
			const result = parseArgs(["--inputs", "1,2,3"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, inputs: "1,2,3" },
			});
		});

		it("should parse --inputs-file option with value", () => {
			const result = parseArgs(["--inputs-file", "/path/to/file.json"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, inputsFile: "/path/to/file.json" },
			});
		});

		it("should ignore --inputs option when next arg is a flag", () => {
			const result = parseArgs(["--inputs", "--verbose"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true },
			});
		});

		it("should ignore --inputs-file option when next arg is a flag", () => {
			const result = parseArgs(["--inputs-file", "--help"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, help: true },
			});
		});

		it("should parse path with flags", () => {
			const result = parseArgs(["--verbose", "/some/path", "--list"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions, verbose: true, list: true },
			});
		});

		it("should parse multiple flags", () => {
			const result = parseArgs(["--verbose", "--validate", "--list"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true, validate: true, list: true },
			});
		});

		it("should parse short flags", () => {
			const result = parseArgs(["-v", "-h", "-l"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true, help: true, list: true },
			});
		});

		it("should parse mixed short and long flags", () => {
			const result = parseArgs(["-v", "--verbose", "--help", "-h"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true, help: true },
			});
		});

		it("should normalize subcommand 'list' to --list", () => {
			const result = parseArgs(["list"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, list: true },
			});
		});

		it("should normalize subcommand 'help' to --help", () => {
			const result = parseArgs(["help"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, help: true },
			});
		});

		it("should normalize subcommand 'validate' to --validate", () => {
			const result = parseArgs(["validate"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, validate: true },
			});
		});

		it("should parse subcommand with path", () => {
			const result = parseArgs(["validate", "/some/path"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions, validate: true },
			});
		});

		it("should parse all options together", () => {
			const result = parseArgs([
				"--verbose",
				"--inputs", "1,2,3",
				"--inputs-file", "data.json",
				"/some/path",
				"--list",
			]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: {
					verbose: true,
					validate: false,
					help: false,
					list: true,
					synth: false,
					inputs: "1,2,3",
					inputsFile: "data.json",
				},
			});
		});

		it("should handle path before flags", () => {
			const result = parseArgs(["/some/path", "--verbose", "--list"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions, verbose: true, list: true },
			});
		});

		it("should ignore unknown flags starting with dash", () => {
			const result = parseArgs(["--unknown", "/some/path"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions },
			});
		});

		it("should handle empty string as path", () => {
			const result = parseArgs([""]);
			assert.deepStrictEqual(result, {
				path: "",
				options: { ...defaultOptions },
			});
		});

		it("should parse inputs with dashes in value", () => {
			const result = parseArgs(["--inputs", "1-2,3-4"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, inputs: "1-2,3-4" },
			});
		});

		it("should treat inputs starting with dash as flag (not captured)", () => {
			// Values starting with dash are treated as flags, so -1 is not captured
			const result = parseArgs(["--inputs", "-1,-2,-3"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions },
			});
		});

		it("should handle path with special characters", () => {
			const result = parseArgs(["/path/to/file-with-dashes.json"]);
			assert.deepStrictEqual(result, {
				path: "/path/to/file-with-dashes.json",
				options: { ...defaultOptions },
			});
		});

		it("should handle relative paths", () => {
			const result = parseArgs(["../some/relative/path"]);
			assert.deepStrictEqual(result, {
				path: "../some/relative/path",
				options: { ...defaultOptions },
			});
		});

		it("should handle multiple path-like arguments (last one wins)", () => {
			const result = parseArgs(["/path1", "/path2", "/path3"]);
			assert.deepStrictEqual(result, {
				path: "/path3",
				options: { ...defaultOptions },
			});
		});

		it("should handle inputs option at end", () => {
			const result = parseArgs(["--verbose", "--inputs", "test,data"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true, inputs: "test,data" },
			});
		});

		it("should handle inputs-file option at end", () => {
			const result = parseArgs(["--verbose", "--inputs-file", "test.json"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true, inputsFile: "test.json" },
			});
		});

		it("should handle both inputs and inputs-file", () => {
			const result = parseArgs([
				"--inputs", "1,2,3",
				"--inputs-file", "data.json",
			]);
			assert.deepStrictEqual(result, {
				path: null,
				options: {
					...defaultOptions,
					inputs: "1,2,3",
					inputsFile: "data.json",
				},
			});
		});

		it("should handle duplicate flags (last occurrence ignored, first wins)", () => {
			const result = parseArgs(["--verbose", "--verbose"]);
			assert.deepStrictEqual(result, {
				path: null,
				options: { ...defaultOptions, verbose: true },
			});
		});

		it("should handle synth flag with other options", () => {
			const result = parseArgs(["--synth", "/some/path", "-v"]);
			assert.deepStrictEqual(result, {
				path: "/some/path",
				options: { ...defaultOptions, synth: true, verbose: true },
			});
		});

		it("should handle all boolean flags set to true", () => {
			const result = parseArgs([
				"--verbose",
				"--validate",
				"--help",
				"--list",
				"--synth",
			]);
			assert.deepStrictEqual(result, {
				path: null,
				options: {
					verbose: true,
					validate: true,
					help: true,
					list: true,
					synth: true,
				},
			});
		});
	});
});
