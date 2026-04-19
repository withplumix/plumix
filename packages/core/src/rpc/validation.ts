import * as v from "valibot";

// Shared leaf-level field schemas. Consumed server-side by RPC procedure
// input schemas AND client-side by admin forms — same rules on both ends so
// a submit that passes client validation can't then fail server validation
// on shape alone. Messages are user-facing: they surface unchanged in admin
// forms and in RPC error payloads when validation rejects.

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
