import * as v from "valibot";

export { setI18nResolver, vMessage } from "./vmessage.js";
export type { I18nResolver } from "./vmessage.js";

// Shared leaf-level field schemas. Consumed server-side by RPC procedure
// input schemas AND client-side by admin forms — same rules on both ends so
// a submit that passes client validation can't then fail server validation
// on shape alone. Messages are user-facing: they surface unchanged in admin
// forms and in RPC error payloads when validation rejects.
//
// These shared-schema messages stay in English. Wrapping them in
// `vMessage(defineMessage(...))` requires the `@lingui/core/macro`
// runtime, which depends on babel-plugin-lingui-macro processing —
// core's plain `tsc` build can't run that. Per-callsite admin schemas
// (mailer, allowed-domains, users/create, auth/device, login) DO use
// `vMessage` and translate. Server-side schema translation is its own
// slice, requiring a lingui pipeline for the core package.

/** RFC 5321 caps email at 254 chars. */
export const emailField = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Enter an email address."),
  v.maxLength(254, "Email is too long."),
  v.email("Enter a valid email address."),
);

/** Display name. Empty is allowed at the schema level; required-ness is
 * a per-form decision handled via `v.optional` / presence checks. */
export const nameField = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(200, "Name is too long."),
);

/**
 * Canonical row-id shape for RPC inputs. MAX_SAFE_INTEGER cap rejects
 * integer-valued numbers like `1e21` that pass `v.integer()` but lose
 * precision in cache keys and DB comparisons.
 */
export const idParam = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);

/**
 * String-to-int coercer for URL path params. The regex is tighter than
 * `Number()` — it rejects hex (`"0x1F"`), exponential (`"5e2"`), signed,
 * whitespace-wrapped, leading-zero, and empty strings, all of which
 * `Number()` would otherwise coerce to a valid positive int.
 */
export const idPathParam = v.pipe(
  v.string(),
  v.regex(/^[1-9]\d*$/, "id must be a positive decimal integer"),
  v.transform((s) => Number(s)),
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);
