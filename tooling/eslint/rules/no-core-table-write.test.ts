import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { noCoreTableWrite } from "./no-core-table-write.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester({
  languageOptions: { parser: tseslint.parser },
}).run("plumix/no-core-table-write", noCoreTableWrite, {
  valid: [
    [
      'import { comments } from "./db/schema.js";',
      "await ctx.db.insert(comments).values(row);",
      "await tx.update(comments).set(patch);",
      "await ctx.db.delete(comments);",
    ].join("\n"),
    [
      'import { entries } from "plumix/schema";',
      "const rows = await ctx.db.select().from(entries);",
    ].join("\n"),
    [
      'import { settings } from "plumix/schema";',
      "await ctx.db[insert](settings);",
      "cache.delete(key, settings);",
    ].join("\n"),
    [
      'import { claimTerm } from "plumix/db";',
      'import { terms } from "plumix/schema";',
      "await claimTerm(ctx.db, terms, id);",
    ].join("\n"),
  ],
  invalid: [
    {
      code: [
        'import { entries } from "plumix/schema";',
        "await ctx.db.insert(entries).values(row);",
      ].join("\n"),
      errors: [{ messageId: "coreTableWrite" }],
    },
    {
      code: [
        'import { terms as termTable, entryTerm } from "plumix/schema";',
        "await ctx.db.transaction(async (tx) => {",
        "  await tx.update(termTable).set(patch);",
        "  await tx.delete(entryTerm).where(match);",
        "});",
      ].join("\n"),
      errors: [
        { messageId: "coreTableWrite", line: 3 },
        { messageId: "coreTableWrite", line: 4 },
      ],
    },
    {
      code: [
        'import * as schema from "plumix/schema";',
        "await ctx.db.delete(schema.settings);",
      ].join("\n"),
      errors: [{ messageId: "coreTableWrite" }],
    },
  ],
});
