import type { MessageDescriptor } from "@lingui/core";
import * as v from "valibot";

import {
  META_FIELD_KEY_MAX_LENGTH,
  META_FIELD_KEY_RE,
} from "../../plugin/validation/meta-field-key.js";
import { vMessage } from "./vmessage.js";

export { setI18nResolver, vMessage } from "./vmessage.js";
export type { I18nResolver } from "./vmessage.js";
export { META_FIELD_MESSAGES } from "../../meta/contract/field-messages.js";

// Shared by RPC input schemas and admin forms so both validate the same
// shape. Descriptors are plain literals because core builds with plain `tsc`,
// without Lingui macros.

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
 * Raw building blocks, not a schema, so the server `slugSchema` and admin
 * forms validate identical rules.
 */
export const SLUG_MAX_LENGTH = 200;
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
 * Stricter than `Number()`: rejects hex, exponential, signed,
 * whitespace-wrapped, leading-zero and empty strings.
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

// Not translated: outer-shape errors reach only direct RPC consumers, never
// admin forms.
const MAX_META_KEYS_PER_REQUEST = 200;

const metaKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(META_FIELD_KEY_MAX_LENGTH),
  v.regex(META_FIELD_KEY_RE, "meta key must be alphanumeric/_/:/-"),
);

/**
 * Checks only the outer shape and key cap; each handler validates values
 * against the entity's registered meta box types.
 */
export const metaInputSchema = v.pipe(
  v.record(metaKeySchema, v.unknown()),
  v.check(
    (val) => Object.keys(val).length <= MAX_META_KEYS_PER_REQUEST,
    `meta accepts at most ${MAX_META_KEYS_PER_REQUEST} keys per request`,
  ),
);
