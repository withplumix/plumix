import * as v from "valibot";

import {
  META_FIELD_KEY_MAX_LENGTH,
  META_FIELD_KEY_RE,
} from "../../../plugin/validation/meta-field-key.js";

// Group / page identifiers stay tight — lowercase snake_case ASCII so
// they're safe in URLs (`/settings/<page>`), testids, and future
// storage backends that may quote differently. Matches the
// registration-time `SETTINGS_NAME_RE` in `plugin/validation/identifiers.ts`.
const settingsNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[a-z][a-z0-9_]*$/, "must be lowercase ASCII [a-z][a-z0-9_]*"),
);

// Field-value keys share the permissive meta regex (`og:title`,
// `my-field`, `2fa_enabled` all valid) so a plugin registering a
// `MetaBoxField` via `registerSettingsGroup` isn't rejected at the
// RPC boundary.
const settingsValueKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(META_FIELD_KEY_MAX_LENGTH),
  v.regex(META_FIELD_KEY_RE, "settings value key must match [a-zA-Z0-9_:-]+"),
);

export const settingsGetInputSchema = v.object({
  group: settingsNameSchema,
});

// Caps keys per request against fan-out from callers iterating untrusted
// input. 64 KiB per value matches the WP `wp_options` convention.
const MAX_SETTINGS_VALUE_BYTES = 64 * 1024;
const MAX_SETTINGS_KEYS_PER_UPSERT = 200;

export const settingsUpsertInputSchema = v.object({
  group: settingsNameSchema,
  values: v.pipe(
    v.record(settingsValueKeySchema, v.unknown()),
    v.check(
      (val) => Object.keys(val).length <= MAX_SETTINGS_KEYS_PER_UPSERT,
      `upsert accepts at most ${MAX_SETTINGS_KEYS_PER_UPSERT} keys per request`,
    ),
  ),
});

export type SettingsGetInput = v.InferOutput<typeof settingsGetInputSchema>;
export type SettingsUpsertInput = v.InferOutput<
  typeof settingsUpsertInputSchema
>;

export { MAX_SETTINGS_VALUE_BYTES };
