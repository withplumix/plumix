import * as path from "node:path";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { syncCommentGuarded } from "./sync-comment-guarded.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const filename = path.join(import.meta.dirname, "example.ts");

/** The `sha256sum` of the trimmed first fixture line below, cut to 16 characters. */
const MIRRORS_HASH = "98a57b9564263b90";

new RuleTester().run("plumix/sync-comment-guarded", syncCommentGuarded, {
  valid: [
    { code: "// The cache holds one entry per slug.\nconst a = 1;", filename },
    {
      code: "// Keep it short. The `in sync` flag is the server's.\nconst a = 1;",
      filename,
    },
    ...[
      "tooling/eslint/test/base-config.test.ts",
      "apps/docs/src/content-checks/code-samples.build.test.ts",
      "packages/admin-editor/src/block-catalog-tab.browser.test.tsx",
      "apps/demo/e2e/demo.spec.ts",
      "`tooling/eslint/test/base-config.test.ts`.",
    ].map((guard) => ({
      code: `// Mirrors the server's list.\n// Guarded by: ${guard}\nconst a = 1;`,
      filename,
    })),
    {
      code: "/**\n * Keep the two rosters in sync.\n *\n * Guarded by: tooling/eslint/test/base-config.test.ts.\n */\nconst a = 1;",
      filename,
    },
    {
      code: "const a = 1;\n  // Mirrors the server's list.\nconst b = 2;",
      filename,
      options: [
        {
          baseline: [
            { file: "tooling/eslint/rules/example.ts", hash: MIRRORS_HASH },
          ],
        },
      ],
    },
  ],
  invalid: [
    {
      code: "// Mirrors the server's list.\nconst a = 1;",
      filename,
      options: [
        {
          baseline: [
            { file: "tooling/eslint/rules/other.ts", hash: MIRRORS_HASH },
          ],
        },
      ],
      errors: [{ messageId: "unguarded", line: 1 }],
    },
    {
      code: "// Mirrors the client's list.\nconst a = 1;",
      filename,
      options: [
        {
          baseline: [
            { file: "tooling/eslint/rules/example.ts", hash: MIRRORS_HASH },
          ],
        },
      ],
      errors: [{ messageId: "unguarded", line: 1 }],
    },
    {
      code: "// Mirrors the server's list.\nconst a = 1;\n\n// Mirrors the server's list.\nconst b = 2;",
      filename,
      options: [
        {
          baseline: [
            { file: "tooling/eslint/rules/example.ts", hash: MIRRORS_HASH },
          ],
        },
      ],
      errors: [{ messageId: "unguarded", line: 4 }],
    },
    {
      code: "// Mirrors the server's list.\n// Guarded by: tooling/eslint/test/no-such.test.ts\nconst a = 1;",
      filename,
      errors: [{ messageId: "guardMissing", line: 2 }],
    },
    ...["tooling/eslint/base.ts", "tooling/eslint/test/fixtures/e2e"].map(
      (guard) => ({
        code: `// Mirrors the server's list.\n// Guarded by: ${guard}\nconst a = 1;`,
        filename,
        errors: [{ messageId: "guardNotTest", line: 2 }],
      }),
    ),
    {
      code: "// Keep the column list\n// in sync with the schema.\nconst a = 1;",
      filename,
      errors: [{ messageId: "unguarded", line: 1 }],
    },
    ...[
      "// Mirrors the server's list.",
      "// Keeps `roster.names` in sync with the docs.",
      "// Keep this in sync with the admin copy.",
      "// keeps the roster and the docs in sync",
      "// Kept in sync by hand.",
      "// The order must match the migration's.",
      "/* These two must stay in step. */",
    ].map((code) => ({
      code: `${code}\nconst value = 1;`,
      filename,
      errors: [{ messageId: "unguarded", line: 1 }],
    })),
  ],
});
