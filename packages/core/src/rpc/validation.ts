import type { MessageDescriptor } from "@lingui/core";
import * as v from "valibot";

import { vMessage } from "./vmessage.js";

export { setI18nResolver, vMessage } from "./vmessage.js";
export type { I18nResolver } from "./vmessage.js";

// Shared leaf-level field schemas. Consumed server-side by RPC procedure
// input schemas AND client-side by admin forms — same rules on both ends so
// a submit that passes client validation can't then fail server validation
// on shape alone. Messages flow through `vMessage` so admin's `bootI18n`
// resolver can translate them; descriptors are inlined plain literals (not
// `defineMessage(...)`) because core builds with plain `tsc`, no Lingui
// macro pass.
//
// Per-callsite procedure schemas (`procedures/auth/**/schemas.ts`) stay in
// English — they only surface to direct RPC consumers, not admin forms,
// which build their own client-side schemas with locally-wrapped messages.

/**
 * The descriptors behind the shared field schemas. Exported so admin's
 * extraction mirror (`core-validation-i18n.ts`) can re-declare these ids
 * for `lingui extract` and assert lockstep against this source.
 */
export const VALIDATION_DESCRIPTORS = {
  emailRequired: {
    id: "validate.email.required",
    message: "Enter an email address.",
  },
  emailMaxLength: {
    id: "validate.email.maxLength",
    message: "Email is too long.",
  },
  emailInvalid: {
    id: "validate.email.invalid",
    message: "Enter a valid email address.",
  },
  nameMaxLength: {
    id: "validate.name.maxLength",
    message: "Name is too long.",
  },
  idFormat: {
    id: "validate.id.format",
    message: "id must be a positive decimal integer",
  },
} satisfies Record<string, MessageDescriptor>;

/** RFC 5321 caps email at 254 chars. */
export const emailField = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, vMessage(VALIDATION_DESCRIPTORS.emailRequired)),
  v.maxLength(254, vMessage(VALIDATION_DESCRIPTORS.emailMaxLength)),
  v.email(vMessage(VALIDATION_DESCRIPTORS.emailInvalid)),
);

/** Display name. Empty is allowed at the schema level; required-ness is
 * a per-form decision handled via `v.optional` / presence checks. */
export const nameField = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(200, vMessage(VALIDATION_DESCRIPTORS.nameMaxLength)),
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
  v.regex(/^[1-9]\d*$/, vMessage(VALIDATION_DESCRIPTORS.idFormat)),
  v.transform((s) => Number(s)),
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);
