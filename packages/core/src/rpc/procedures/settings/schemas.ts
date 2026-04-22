import * as v from "valibot";

// Group + key identifiers share the same portability rules as the
// registration-time `SETTINGS_NAME_RE` — lowercase ASCII starting with
// a letter. Kept tight so storage keys, testids, and URL segments
// don't need quoting.
const settingsIdentifierSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[a-z][a-z0-9_]*$/, "must be lowercase ASCII [a-z][a-z0-9_]*"),
);

// One round-trip per group is the primary read pattern (admin card
// loads one group). Returning the bag lets the admin form seed its
// state; fields absent from the bag fall back to their registered
// `default`.
export const settingsGetInputSchema = v.object({
  group: settingsIdentifierSchema,
});

// Null values in an upsert are deletions; everything else is an
// upsert. Cap on keys per request blocks accidental fan-out from
// callers that iterate on untrusted input; cap on encoded-value size
// lives in the handler (same pattern as `entry.meta`).
const MAX_SETTINGS_VALUE_BYTES = 256 * 1024;
const MAX_SETTINGS_KEYS_PER_UPSERT = 200;

export const settingsUpsertInputSchema = v.object({
  group: settingsIdentifierSchema,
  values: v.pipe(
    v.record(settingsIdentifierSchema, v.unknown()),
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
