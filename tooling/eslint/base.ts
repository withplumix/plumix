import * as path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importXPlugin from "eslint-plugin-import-x";
import turboPlugin from "eslint-plugin-turbo";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

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
  {
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);

// Named-errors convention (umbrella #232). Production code in opted-in
// areas may not `throw new Error(...)` — use a factory from the area's
// errors.ts (e.g. R2Error.bindingMissing({ binding })). Packages opt in
// by spreading one of these configs alongside baseConfig in their
// eslint.config.ts. Subsequent PRs broaden the scope by adding the import
// (or expanding the file globs) on a per-area basis.
export function noBareThrowErrorFor(filesGlobs: readonly string[]) {
  return defineConfig({
    files: [...filesGlobs],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/test/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            "Use a named factory instead of `throw new Error(...)` — see the area's errors.ts for the pattern (umbrella #232).",
        },
      ],
    },
  });
}

// Whole-`src/` opt-in. Suitable for packages where every production-code
// throw site has already been migrated to a factory. Cloudflare runtime
// uses this shape (issue #236).
export const noBareThrowError = noBareThrowErrorFor([
  "src/**/*.ts",
  "src/**/*.tsx",
]);
