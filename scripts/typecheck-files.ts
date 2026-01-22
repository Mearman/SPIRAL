#!/usr/bin/env tsx
import ts from "typescript"
import path from "node:path"

/**
 * Typecheck specific TypeScript files using the project's tsconfig.json
 *
 * Usage: tsx scripts/typecheck-files.ts file1.ts file2.ts ...
 *
 * This script loads the project's tsconfig.json and typechecks only the
 * specified files. Unlike `tsc file.ts`, this preserves all compiler options.
 */

const files = process.argv.slice(2).filter((arg) => arg.endsWith(".ts") || arg.endsWith(".tsx"))

if (files.length === 0) {
	process.exit(0)
}

// Find and load tsconfig.json
const configPath = ts.findConfigFile(
	process.cwd(),
	ts.sys.fileExists.bind(ts.sys),
	"tsconfig.json",
)

if (!configPath) {
	console.error("Could not find tsconfig.json")
	process.exit(1)
}

const configContent = ts.sys.readFile(configPath)
if (!configContent) {
	console.error(`Could not read ${configPath}`)
	process.exit(1)
}

const configResult = ts.parseConfigFileTextToJson(configPath, configContent)
if (configResult.error) {
	console.error("Error parsing tsconfig.json:", ts.flattenDiagnosticMessageText(configResult.error.messageText, "\n"))
	process.exit(1)
}

// Parse compiler options
const parsedCmd = ts.parseJsonConfigFileContent(
	configResult.config,
	ts.sys,
	process.cwd(),
)

// Filter to only the files we want to check
// We need to resolve the file paths to absolute paths
const resolvedFiles = files.map((f) => path.resolve(process.cwd(), f))

// Create program with only our files
const host = ts.createCompilerHost(parsedCmd.options)
const program = ts.createProgram(resolvedFiles, parsedCmd.options, host)

// Emit and check diagnostics
const emitResult = program.emit()

const allDiagnostics = ts
	.getPreEmitDiagnostics(program)
	.concat(emitResult.diagnostics)

let hasError = false

for (const diagnostic of allDiagnostics) {
	if (diagnostic.category === ts.DiagnosticCategory.Error) {
		hasError = true
	}

	if (diagnostic.file) {
		const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
			diagnostic.start || 0,
		)
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		console.error(`${diagnostic.file.fileName}:${line + 1}:${character + 1}: error TS${diagnostic.code}: ${message}`)
	} else {
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		console.error(`error: ${message}`)
	}
}

process.exit(hasError ? 1 : 0)
