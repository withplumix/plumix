import type { DevErrorHint } from "@plumix/blocks/dev-error";

import type { HookRegistry } from "../../hooks/registry.js";
import { ThemeError, ThemeRegistrationError } from "../../theme-errors.js";

import "./types.js";

// A matcher inspects the caught value and, when it recognizes it, returns the
// hint to surface. Typed matchers (`instanceof`, reliable) come first, then
// untyped signature matchers over the message text (curated, documented
// pitfalls). As an untyped pitfall proves common it graduates to a typed
// error and moves up — the swap is non-breaking because matching lives here,
// not on the Error classes (decision #1575).
type Matcher = (error: unknown) => DevErrorHint | null;

const TYPED_MATCHERS: readonly Matcher[] = [
  (error) =>
    error instanceof ThemeRegistrationError
      ? {
          title: "Check your theme registration",
          body:
            "Plumix rejected the theme's shape while registering it. The message " +
            "above names the exact field to change — every app renders public " +
            "routes through a theme, so this must resolve before any page renders.",
        }
      : null,
  (error) =>
    error instanceof ThemeError
      ? {
          title: "Fix the theme token",
          body:
            "A design token in your theme has an invalid slug or value. Token " +
            "slugs must match /^[a-z][a-z0-9-]*$/ and values can't contain CSS " +
            "delimiters — they're embedded into custom-property declarations.",
        }
      : null,
];

// Each untyped matcher documents the stable signature it keys off. These match
// errors raised by the platform (D1/SQLite, the Workers runtime), not by
// plumix code, so message substrings are the only reliable handle.
const UNTYPED_MATCHERS: readonly Matcher[] = [
  // D1/SQLite raises `no such table` when a query hits a table the local
  // database is missing — almost always unapplied migrations.
  signature(/no such table/i, {
    title: "Run your migrations",
    body:
      "The database is missing a table your query needs. Run `plumix migrate` " +
      "to apply pending migrations to your local D1 database, then reload.",
  }),
  // A required secret isn't set. In dev, secrets live in `.dev.vars`.
  signature(/missing (?:required )?secret/i, {
    title: "Add the missing secret",
    body:
      "A required secret isn't set. Add it to `.dev.vars` in your project root " +
      "(one `KEY=value` per line), then restart `plumix dev`.",
  }),
  // A binding referenced in code isn't declared for the worker.
  signature(/missing (?:required )?binding|no binding named/i, {
    title: "Declare the binding",
    body:
      "Your code used a binding that isn't declared. Add it to `wrangler.jsonc` " +
      "(the `d1_databases`, `kv_namespaces`, `r2_buckets`, … block that fits), " +
      "then restart the dev server.",
  }),
];

/**
 * Registers core's built-in error-page hints. Wired at `buildApp` time behind
 * the dev gate, at low priority (10) so plugin hints (default priority 100)
 * rank after core's and can prepend to place their own first. Mirrors
 * `registerCoreDebugPanels`.
 */
export function registerCoreErrorHints(hooks: HookRegistry): void {
  hooks.addFilter(
    "error_page:hints",
    (hints, error) => {
      const matched: DevErrorHint[] = [];
      for (const match of TYPED_MATCHERS) {
        const hint = match(error);
        if (hint) matched.push(hint);
      }
      for (const match of UNTYPED_MATCHERS) {
        const hint = match(error);
        if (hint) matched.push(hint);
      }
      return [...hints, ...matched];
    },
    { plugin: "core", priority: 10 },
  );
}

// Builds a matcher that recognizes an error by a substring/regex over its
// message. Non-`Error` throws (which carry no reliable message) never match.
function signature(pattern: RegExp, hint: DevErrorHint): Matcher {
  return (error) =>
    error instanceof Error && pattern.test(error.message) ? hint : null;
}
