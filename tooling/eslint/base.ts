import * as path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importXPlugin from "eslint-plugin-import-x";
import turboPlugin from "eslint-plugin-turbo";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import { plumixPlugin } from "./rules/index.js";

// Exported so consumer configs that extend `no-restricted-syntax` for their
// own selectors can re-include this entry — ESLint flat config replaces the
// rule wholesale rather than merging selector lists.
export const NO_THROW_NEW_ERROR_SELECTOR = {
  selector: "ThrowStatement > NewExpression[callee.name='Error']",
  message:
    "Use a named factory instead of `throw new Error(...)` — see the area's errors.ts for the pattern (umbrella #232).",
} as const;

// Type augmentation must go through the single public `plumix` specifier, not
// an internal `@plumix/*` package or a `plumix/*` subpath. Augmenting the same
// interface via two specifiers fractures declaration merging — each view drops
// the other's keys — so the whole ecosystem uses one target (issue #1691).
// Bare `plumix`, relative paths, and third-party modules are unaffected.
export const NO_INTERNAL_MODULE_AUGMENTATION_SELECTOR = {
  selector: "TSModuleDeclaration[id.value=/^(@plumix\\/|plumix\\/)/]",
  message:
    "Augment the public `plumix` specifier, not internal `@plumix/*` packages or `plumix/*` subpaths — mixing augmentation targets fractures declaration merging (issue #1691).",
} as const;

const PRODUCTION_SOURCE = ["src/**/*.ts", "src/**/*.tsx"];
const TEST_SOURCE = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/test/**",
];

export const baseConfig = defineConfig(
  includeIgnoreFile(path.join(import.meta.dirname, "../../.gitignore")),
  // The root .gitignore patterns are anchored to the repo root, but ESLint
  // runs per-package (cwd = the package dir), so `includeIgnoreFile` can't
  // exclude these generated outputs. Re-state them as cwd-relative globs:
  //   - `**/*.config.*`        — Vite/lingui/etc. config files
  //   - `**/locales/*.mjs`     — Lingui-compiled message catalogs
  //   - `**/locales/*.d.mts`   — their generated type declarations
  // The compiled catalogs carry a `/*eslint-disable*/` header that otherwise
  // trips `reportUnusedDisableDirectives` once linted.
  { ignores: ["**/*.config.*", "**/locales/*.mjs", "**/locales/*.d.mts"] },
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
        "warn",
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
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/no-duplicates": "error",
    },
  },
  // Augmentation-target convention (issue #1691): every file may only augment
  // the public `plumix` specifier. This broad block covers app/theme code,
  // `.d.ts` files, and tests; the `src/**` block below re-includes the
  // selector because ESLint flat config replaces `no-restricted-syntax`
  // wholesale rather than merging selector lists.
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
  // Earned-types rules (issue #1807). Registered as distinct rules rather
  // than extra `no-restricted-syntax` selectors, so a consumer config that
  // re-declares that rule can't silently drop them. Scoped like the
  // named-errors guard above: fixtures and test doubles are exempt, since
  // forcing them to satisfy these makes tests worse, not better.
  {
    files: PRODUCTION_SOURCE,
    ignores: TEST_SOURCE,
    rules: {
      "plumix/no-reflect-apply": "error",
      "plumix/no-reflect-get": "error",
      "plumix/no-unknown-type-alias": "error",
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);

// Public-API boundary. Consumer packages (plugins, runtimes, the scaffolder)
// must import from the public `plumix` umbrella, never reach into the internal
// @plumix/{core,admin,blocks} packages. Packages opt in by spreading this
// alongside baseConfig in their eslint.config.ts.
export const noInternalImports = defineConfig({
  files: ["**/*.js", "**/*.ts", "**/*.tsx"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@plumix/core", "@plumix/admin", "@plumix/blocks"],
            message:
              "Import from the public 'plumix' umbrella instead of reaching into internal @plumix/{core,admin,blocks} packages.",
          },
        ],
      },
    ],
  },
});
