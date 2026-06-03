import * as path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importXPlugin from "eslint-plugin-import-x";
import turboPlugin from "eslint-plugin-turbo";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Exported so consumer configs that extend `no-restricted-syntax` for their
// own selectors can re-include this entry — ESLint flat config replaces the
// rule wholesale rather than merging selector lists.
export const NO_THROW_NEW_ERROR_SELECTOR = {
  selector: "ThrowStatement > NewExpression[callee.name='Error']",
  message:
    "Use a named factory instead of `throw new Error(...)` — see the area's errors.ts for the pattern (umbrella #232).",
} as const;

export const baseConfig = defineConfig(
  includeIgnoreFile(path.join(import.meta.dirname, "../../.gitignore")),
  { ignores: ["**/*.config.*"] },
  {
    files: ["**/*.js", "**/*.ts", "**/*.tsx"],
    plugins: {
      "import-x": importXPlugin,
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
  // Named-errors convention (umbrella #232): production `src/` code may not
  // `throw new Error(...)` — use a factory from the area's errors.ts.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/test/**"],
    rules: {
      "no-restricted-syntax": ["error", NO_THROW_NEW_ERROR_SELECTOR],
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
