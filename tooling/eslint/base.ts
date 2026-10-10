import * as path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importXPlugin from "eslint-plugin-import-x";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import turboPlugin from "eslint-plugin-turbo";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import { plumixPlugin } from "./rules/index.js";

/**
 * Exported so consumer configs that extend `no-restricted-syntax` for their
 * own selectors can re-include this entry — ESLint flat config replaces the
 * rule wholesale rather than merging selector lists.
 */
export const NO_THROW_NEW_ERROR_SELECTOR = {
  selector: "ThrowStatement > NewExpression[callee.name='Error']",
  message:
    "Use a named factory instead of `throw new Error(...)` — see the area's errors.ts for the pattern (umbrella #232).",
} as const;

/**
 * Augmenting one interface through two specifiers fractures declaration
 * merging, each view dropping the other's keys, so augmentation targets only
 * bare `plumix`.
 */
export const NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR = {
  selector: "TSModuleDeclaration[id.value=/^(@plumix\\/|plumix\\/)/]",
  message:
    "Augment the public `plumix` specifier, not internal `@plumix/*` packages or `plumix/*` subpaths — mixing augmentation targets fractures declaration merging (issue #1691).",
} as const;

const PRODUCTION_SOURCE = ["src/**/*.ts", "src/**/*.tsx"];
/**
 * Production-source blocks exempt these files and the test-id rule targets
 * them, so a glob added here widens an exemption as well as an enforcement.
 */
const TEST_SOURCE = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/test/**/*.ts",
  "**/test/**/*.tsx",
];
/**
 * Playwright specs and the helpers colocated with them. E2E lives outside
 * `src/`, so `PRODUCTION_SOURCE` never reaches it and `TEST_SOURCE` only
 * catches the `*.spec.ts` files, not the support modules beside them.
 */
const E2E_SOURCE = ["**/e2e/**/*.ts", "**/e2e/**/*.tsx"];
const VITEST_CONFIGS = ["**/vitest.config.ts", "**/vitest.*.config.ts"];

export const baseConfig = defineConfig(
  includeIgnoreFile(path.join(import.meta.dirname, "../../.gitignore")),
  // ESLint runs per package, so the root .gitignore's anchored patterns miss
  // these. Vitest configs stay in for the test-tier rule below.
  {
    ignores: [
      "**/*.config.*",
      "!**/vitest.config.ts",
      "!**/vitest.*.config.ts",
      "**/locales/*.mjs",
      "**/locales/*.d.mts",
    ],
  },
  {
    files: ["**/*.js", "**/*.ts", "**/*.tsx"],
    plugins: {
      "import-x": importXPlugin,
      plumix: plumixPlugin,
      turbo: turboPlugin,
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      // Cherry-picked from typescript-eslint's strict preset; the rest of the
      // preset mostly fires on correct code.
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-unnecessary-type-conversion": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/no-deprecated": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/no-duplicates": "error",
    },
  },
  // The `src/**` block below repeats this selector because flat config
  // replaces `no-restricted-syntax` wholesale instead of merging selectors.
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
      ],
    },
  },
  // Named-errors convention (umbrella #232): production `src/` code may not
  // `throw new Error(...)` — use a factory from the area's errors.ts.
  {
    files: PRODUCTION_SOURCE,
    ignores: TEST_SOURCE,
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_THROW_NEW_ERROR_SELECTOR,
        NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR,
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "plumix/max-comment-length": "error",
      "plumix/no-jsdoc-in-function-body": "error",
      "plumix/prefer-jsdoc": "error",
      "sonarjs/no-commented-code": "error",
    },
  },
  // Distinct rules, not `no-restricted-syntax` selectors, so a config that
  // re-declares that rule can't drop them. Test doubles are exempt: forcing
  // these on them makes tests worse.
  {
    files: PRODUCTION_SOURCE,
    ignores: TEST_SOURCE,
    rules: {
      "plumix/no-bare-object-input": "error",
      "plumix/no-chained-type-assertion": "error",
      "plumix/no-reflect-apply": "error",
      "plumix/no-reflect-get": "error",
      "plumix/no-spelled-capability": "error",
      "plumix/no-unknown-return": "error",
      "plumix/no-unknown-type-alias": "error",
      "plumix/no-unparsed-property-typeof": "error",
      "plumix/no-unsafe-dictionary": "error",
      // Not global: a test helper decoding a response into the expected shape
      // asserts on purpose, and `unknown` plus a cast per call site is no
      // better.
      "@typescript-eslint/no-unnecessary-type-parameters": "error",
    },
  },
  // Runs on tests because forging is a test-file habit. A distinct rule since
  // the react config re-declares `no-restricted-syntax` over `src/`.
  {
    files: TEST_SOURCE,
    rules: {
      "plumix/no-forged-app": "error",
    },
  },
  // DOM queries and module mocks only appear where a test runner is present,
  // so these target tests and e2e specs.
  {
    files: [...TEST_SOURCE, ...E2E_SOURCE],
    rules: {
      "plumix/no-module-mocking": "error",
      "plumix/no-non-testid-queries": "error",
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  // Vitest configs sit outside every package's tsconfig, so they are linted
  // for this rule alone, without type information.
  {
    files: TEST_SOURCE,
    rules: { "plumix/test-tier": "error" },
  },
  {
    files: VITEST_CONFIGS,
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false },
    },
    rules: { "plumix/test-tier": "error" },
  },
);

/**
 * Opted into by the admin packages; plugins get it from `pluginConfig`,
 * scoped to `src/admin/`.
 */
export const adminUiConfig = defineConfig({
  files: PRODUCTION_SOURCE,
  ignores: TEST_SOURCE,
  rules: { "plumix/no-error-message-in-ui": "error" },
});

/**
 * Re-declares the rule over the production-source scope, since flat config
 * replaces a rule's options wholesale.
 */
export function capabilityDefiners(definers: readonly string[]) {
  return defineConfig({
    files: PRODUCTION_SOURCE,
    ignores: TEST_SOURCE,
    rules: {
      "plumix/no-spelled-capability": ["error", { definers }],
    },
  });
}

/**
 * Keeps consumer packages on the public `plumix` umbrella so the internal
 * packages can refactor freely.
 */
export const noInternalImports = defineConfig({
  files: ["**/*.js", "**/*.ts", "**/*.tsx"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@plumix/core", "@plumix/admin"],
            message:
              "Import from the public 'plumix' umbrella instead of reaching into internal @plumix/{core,admin} packages.",
          },
        ],
      },
    ],
  },
});
