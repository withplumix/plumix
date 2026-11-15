import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noHistoryComment } from "./no-history-comment.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester().run("plumix/no-history-comment", noHistoryComment, {
  valid: [
    "// see withastro/astro#4103\nconst a = 1;",
    "// see vitejs/vite#12.\nconst a = 1;",
    "// see https://github.com/withastro/astro/issues/4103#issuecomment-1\nconst a = 1;",
    "// A site-wide setting every consumer reads (WordPress #18268).\nconst a = 1;",
    "// Never a copy (WordPress Trac #55895).\nconst a = 1;",
    "// Prints `entry #12` for an unnamed entry.\nconst a = 1;",
    "// Escapes it as &#123; in markup.\nconst a = 1;",
    "// The token is used to sign the cookie.\nconst a = 1;",
    "/** Indent depth — used to render nested terms. */\nconst a = 1;",
    "/** Read-only (used to view a past revision). */\nconst a = 1;",
    "// Used to sign the cookie.\nconst a = 1;",
    "// Hydration re-renders the island once.\nconst a = 1;",
  ],
  invalid: [
    ...[
      "// see #1351",
      "/* see #1351 */",
      "/** Named-error convention (umbrella #232). */",
      "// Regression guard for PR#1559.",
      "// The #1491 trace.",
      "// Wordpress #18268 is not the upstream spelling.",
      "// The Trac #55895 ticket names no project.",
    ].map((comment) => ({
      code: `${comment}\nconst a = 1;`,
      errors: [{ messageId: "ticket", line: 1 }],
    })),
    ...[
      "// previously X",
      "// Folded in for now.",
      "// The adapter no longer reads it.",
      "// We changed the order.",
      "// The loader used to cache it.",
      "// Previously X",
    ].map((comment) => ({
      code: `${comment}\nconst a = 1;`,
      errors: [{ messageId: "history", line: 1 }],
    })),
    {
      code: "// The value stays put for\n// now, see #12.\nconst a = 1;",
      errors: [
        { messageId: "history", line: 1 },
        { messageId: "ticket", line: 2 },
      ],
    },
    {
      code: "const a = 1; // see #1351",
      errors: [{ messageId: "ticket", line: 1 }],
    },
  ],
});
