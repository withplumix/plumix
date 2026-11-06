import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { noBareDate } from "./no-bare-date.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester({
  languageOptions: { parser: tseslint.parser },
}).run("plumix/no-bare-date", noBareDate, {
  valid: [
    "const at = now();",
    "const at = new Date(row.createdAt);",
    'const at = new Date("2026-01-01T00:00:00Z");',
    "const at = new Date(now().getTime() + 60_000);",
    "const ms = Date.parse(iso);",
    "const ms = Date.UTC(2026, 0, 1);",
    "const ms = clock.now();",
  ],
  invalid: [
    {
      code: "const ms = Date.now();",
      errors: [{ messageId: "bareDate" }],
    },
    {
      code: "const at = new Date();",
      errors: [{ messageId: "bareDate" }],
    },
    {
      code: "const at = new Date;",
      errors: [{ messageId: "bareDate" }],
    },
    {
      code: "const at = new Date(Date.now() + 1000);",
      errors: [{ messageId: "bareDate" }],
    },
  ],
});
