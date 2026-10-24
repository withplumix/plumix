import type {
  DevErrorHint,
  DevErrorHintRegistration,
  MutableDevRuntime,
} from "../../../context/dev-runtime.js";
import { ThemeError, ThemeRegistrationError } from "../../../theme-errors.js";
import { registerDevItem } from "../../registrations.js";
import { toDevErrorHint } from "./collect.js";

/**
 * Matching lives here, not on the Error classes, so an untyped pitfall can
 * graduate to a typed error without a breaking change.
 */
const CORE_ERROR_HINTS: readonly DevErrorHintRegistration[] = [
  {
    id: "theme-registration",
    matches: (error) => error instanceof ThemeRegistrationError,
    title: "Check your theme registration",
    body:
      "Plumix rejected the theme's shape while registering it. The message " +
      "above names the exact field to change — every app renders public " +
      "routes through a theme, so this must resolve before any page renders.",
  },
  {
    id: "theme-token",
    matches: (error) => error instanceof ThemeError,
    title: "Fix the theme token",
    body:
      "A design token in your theme has an invalid slug or value. Token " +
      "slugs must match /^[a-z][a-z0-9-]*$/ and values can't contain CSS " +
      "delimiters — they're embedded into custom-property declarations.",
  },
  // Platform errors (D1/SQLite, the Workers runtime) carry no type, so a
  // message substring is the only handle. D1/SQLite raises `no such table`
  // when the local database is missing a table: unapplied migrations.
  {
    id: "migrations",
    matches: messageMatches(/no such table/i),
    title: "Run your migrations",
    body:
      "The database is missing a table your query needs. Run `plumix migrate` " +
      "to apply pending migrations to your local D1 database, then reload.",
  },
  // In dev, secrets live in `.env`.
  {
    id: "missing-secret",
    matches: messageMatches(/missing (?:required )?secret/i),
    title: "Add the missing secret",
    body:
      "A required secret isn't set. Add it to `.env` in your project root " +
      "(one `KEY=value` per line), then restart `plumix dev`.",
  },
];

/**
 * Registration-free, so the boot-error path, where no app exists yet, can
 * call it directly.
 */
export function matchCoreErrorHints(error: unknown): DevErrorHint[] {
  return CORE_ERROR_HINTS.filter((hint) => hint.matches(error)).map(
    toDevErrorHint,
  );
}

/** Registered before any plugin, so core's hints lead the card. */
export function registerCoreErrorHints(dev: MutableDevRuntime): void {
  for (const hint of CORE_ERROR_HINTS) {
    registerDevItem(dev.errorHints, "error hint", hint, null);
  }
}

/** Non-`Error` throws, which carry no reliable message, never match. */
function messageMatches(pattern: RegExp): (error: unknown) => boolean {
  return (error) => error instanceof Error && pattern.test(error.message);
}
