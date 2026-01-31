import eslint from "@eslint/js";
import markdown from "@eslint/markdown";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";
import type { Rule } from "eslint";
import type { ConfigArray } from "typescript-eslint";

// Custom rule: enforce test file naming convention
const testFileNamingRule: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce that test files end with .unit.test.ts or .integration.test.ts",
			category: "Best Practices",
			recommended: true,
		},
		messages: {
			invalidTestFileName:
				"Test file must end with .unit.test.ts or .integration.test.ts. Found: '{{actual}}'",
		},
	},
	create(context) {
		const filename = context.filename;

		return {
			Program() {
				// Skip if not a test file
				if (!filename.match(/\.test\.ts$|\.spec\.ts$/)) {
					return;
				}

				// Check if it follows the allowed naming convention
				const validSuffixes = [".unit.test.ts", ".integration.test.ts"];
				const isValid = validSuffixes.some((suffix) => filename.endsWith(suffix));

				if (isValid) {
					return;
				}

				context.report({
					loc: { column: 0, line: 1 },
					messageId: "invalidTestFileName",
					data: { actual: filename },
				});
			},
		};
	},
};

// JSON Schema key ordering (reused for root and nested schema objects)
const jsonSchemaKeyOrder = [
	"$schema",
	"$id",
	"$ref",
	"$defs",
	"title",
	"description",
	"type",
	"const",
	"enum",
	"default",
	"properties",
	"patternProperties",
	"additionalProperties",
	"required",
	"items",
	"additionalItems",
	"contains",
	"minItems",
	"maxItems",
	"uniqueItems",
	"oneOf",
	"anyOf",
	"allOf",
	"not",
	"if",
	"then",
	"else",
	"discriminator",
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"multipleOf",
	"minLength",
	"maxLength",
	"pattern",
	"format",
];

// Extract the jsonc plugin for reuse in file-specific overrides.
// The recommended config's plugin registration is scoped to **/*.json, so
// override blocks with different file patterns need the plugin explicitly.
const jsoncPlugin = { jsonc: jsonc };

export default [
	// Global ignores
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"wiki/**",
			".pytest_cache/**",
			".claude/**",
			"CLAUDE.md", // symlink to README.md
			"AGENTS.md", // symlink to README.md
			"*.config.js",
			"*.config.mjs",
			"*.config.ts", // Ignore config file to avoid parsing issues
		],
	},

	// Test file naming convention - enforce .unit.test.ts or .integration.test.ts
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		plugins: {
			spiral: { rules: { "test-file-naming": testFileNamingRule } },
		},
		rules: {
			"spiral/test-file-naming": "error",
		},
	},

	// Base ESLint recommended rules (only for JS/TS files)
	{
		...eslint.configs.recommended,
		files: ["**/*.ts", "**/*.js", "**/*.mjs", "**/*.cjs"],
	},

	// TypeScript (strict type-aware) - only for src/**/*.ts files
	...tseslint.configs.strictTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts"],
	})),
	...tseslint.configs.stylisticTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts"],
	})),
	{
		files: ["src/**/*.ts"],
		linterOptions: {
			noInlineConfig: true,
		},
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.config.ts"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-explicit-any": "error",
			// Allow number in template literals
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{ allowNumber: true },
			],
			// Allow string + number (for error messages)
			"@typescript-eslint/restrict-plus-operands": [
				"error",
				{ allowNumberAndString: true },
			],
			// Forbid all type assertions (use proper type guards instead)
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/non-nullable-type-assertion-style": "off",
			"@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
			// File and function size/complexity limits
			"max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
			"max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
			"max-statements": ["warn", 10],
			complexity: ["warn", { max: 10 }],
			"max-depth": ["warn", { max: 4 }],
			"max-params": ["warn", { max: 3 }],
			"max-nested-callbacks": ["warn", { max: 3 }],
		},
	},

	// Per-file overrides for structurally complex files
	{
		files: [
			"src/validator.ts",
			"src/zod-schemas.ts",
			"src/synth/python.ts",
			"src/async-effects.ts",
		],
		rules: {
			"max-lines": "off",
			"max-lines-per-function": "off",
			"max-params": "off",
			"max-statements": "off",
			complexity: "off",
			"max-depth": "off",
		},
	},
	{
		files: ["src/validator.ts"],
		rules: {
			"@typescript-eslint/no-unnecessary-condition": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/consistent-type-assertions": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
		},
	},
	{
		files: ["src/zod-schemas.ts"],
		rules: {
			"@typescript-eslint/consistent-type-assertions": "off",
		},
	},
	{
		files: ["src/synth/python.ts"],
		rules: {
			"@typescript-eslint/no-unnecessary-condition": "off",
		},
	},
	{
		files: ["src/scheduler.ts", "src/default-scheduler.ts"],
		rules: {
			"@typescript-eslint/no-empty-function": "off",
		},
	},
	{
		files: ["src/default-scheduler.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
		},
	},

	// TypeScript (basic rules without type checking) - for test, examples, and scripts
	...tseslint.configs.recommended.map((config) => ({
		...config,
		files: ["test/**/*.ts", "examples/**/*.ts", "scripts/**/*.ts"],
	})),
	{
		files: ["test/**/*.ts", "examples/**/*.ts", "scripts/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-explicit-any": "off", // Tests often need any
			"@typescript-eslint/ban-ts-comment": ["error", {
				"ts-check": false,
				"ts-expect-error": "allow-with-description",
				"ts-ignore": true,
				"ts-nocheck": true,
			}],
			"no-case-declarations": "off",
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
		},
	},

	// JSON files - scope ALL jsonc configs to .json files only, exclude markdown code blocks
	...jsonc.configs["flat/recommended-with-json"].map((config) => ({
		...config,
		files: ["**/*.json"],
		ignores: ["**/*.md/**"],
	})),
	{
		files: ["**/*.json"],
		ignores: ["**/*.md/**"],
		rules: {
			"jsonc/indent": ["error", "tab"],
			"jsonc/quotes": ["error", "double"],
			// Default: sort keys alphabetically
			"jsonc/sort-keys": ["error",
				{
					pathPattern: ".*",
					order: { type: "asc" },
				},
			],
		},
	},

	// package.json - conventional field ordering
	{
		files: ["package.json"],
		plugins: jsoncPlugin,
		rules: {
			"jsonc/sort-keys": ["error",
				{
					pathPattern: "^$",
					order: [
						"name",
						"version",
						"private",
						"description",
						"keywords",
						"license",
						"author",
						"contributors",
						"funding",
						"repository",
						"homepage",
						"bugs",
						"type",
						"main",
						"module",
						"types",
						"exports",
						"typesVersions",
						"bin",
						"files",
						"directories",
						"man",
						"scripts",
						"dependencies",
						"devDependencies",
						"peerDependencies",
						"optionalDependencies",
						"bundleDependencies",
						"engines",
						"os",
						"cpu",
						"packageManager",
						"publishConfig",
						"config",
						"workspaces",
						"overrides",
						"resolutions",
						"c8",
						"lint-staged",
					],
				},
				{
					pathPattern: "^(?:dependencies|devDependencies|peerDependencies|optionalDependencies|bundleDependencies|overrides|resolutions)$",
					order: { type: "asc" },
				},
				{
					pathPattern: "^scripts$",
					order: { type: "asc" },
				},
				{
					pathPattern: ".",
					order: { type: "asc" },
				},
			],
		},
	},

	// SPIRAL document files - semantic field ordering
	{
		files: [
			"examples/**/*.json",
			"!examples/**/*.inputs.json",
		],
		plugins: jsoncPlugin,
		rules: {
			"jsonc/sort-keys": ["error",
				{
					pathPattern: "^$",
					order: [
						"$schema",
						"version",
						"description",
						"airDefs",
						"nodes",
						"result",
						"expected_result",
						"note",
					],
				},
				{
					pathPattern: "^airDefs\\[\\d+\\]$",
					order: [
						"ns",
						"name",
						"params",
						"result",
						"body",
					],
				},
				{
					pathPattern: "^nodes\\[\\d+\\]$",
					order: [
						"id",
						"expr",
						"blocks",
						"entry",
					],
				},
				{
					pathPattern: ".",
					hasProperties: ["kind"],
					order: [
						"kind",
						"type",
						"id",
						"ns",
						"name",
						"op",
						"target",
						"value",
						"params",
						"args",
						"fn",
						"body",
						"cond",
						"then",
						"else",
						"returns",
					],
				},
				{
					pathPattern: ".",
					order: { type: "asc" },
				},
			],
		},
	},

	// JSON Schema files - schema field ordering
	// MUST come after SPIRAL document rules so it overrides for *.schema.json.
	// Uses **/ prefix to ensure ESLint flat config matches root-level files.
	{
		files: ["**/*.schema.json"],
		plugins: jsoncPlugin,
		rules: {
			"jsonc/sort-keys": ["error",
				{
					pathPattern: "^$",
					order: jsonSchemaKeyOrder,
				},
				{
					pathPattern: ".",
					hasProperties: ["$ref"],
					order: [
						"$ref",
					],
				},
				{
					pathPattern: ".",
					hasProperties: ["type"],
					order: jsonSchemaKeyOrder,
				},
				{
					pathPattern: ".",
					order: { type: "asc" },
				},
			],
		},
	},

	// Markdown - scope to .md files only, but exclude .tmp
	...markdown.configs.recommended.map((config) => ({
		...config,
		files: ["**/*.md"],
		ignores: [".tmp/**/*.md"],
	})),
	{
		files: ["**/*.md"],
		ignores: [".tmp/**/*.md"],
		plugins: jsoncPlugin,
		rules: {
			// Allow code blocks without language (many are pseudo-code or math notation)
			"markdown/fenced-code-language": "off",
			// Disable jsonc/sort-keys for markdown files - the markdown processor
			// extracts JSON code blocks which inherit parent rules, but the jsonc
			// parser isn't available in that context causing crashes
			"jsonc/sort-keys": "off",
		},
	},
] satisfies ConfigArray;
