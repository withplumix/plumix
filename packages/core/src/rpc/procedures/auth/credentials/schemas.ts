import * as v from "valibot";

// Defensive bound on credential id values from the URL/body. WebAuthn
// credential IDs are typically tens to a few hundred bytes; 1024 chars
// of base64url-equivalent text is generous. Match the cap the passkey
// register/login routes already use.
const credentialIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(1024),
);

// Human-readable label shown in the credential list. CR/LF blocked
// defense-in-depth — same rationale as `siteName` and login-link
// labels: a future audit-log consumer could splice into a line-
// oriented format.
const credentialNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "name must be non-empty"),
  v.maxLength(64, "name must be ≤ 64 chars"),
  v.regex(/^[^\r\n]+$/, "name must not contain newlines"),
);

export const credentialsListInputSchema = v.optional(v.object({}), {});

export const credentialsRenameInputSchema = v.object({
  id: credentialIdSchema,
  name: credentialNameSchema,
});

export const credentialsDeleteInputSchema = v.object({
  id: credentialIdSchema,
});
