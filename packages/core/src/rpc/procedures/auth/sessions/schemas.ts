import * as v from "valibot";

export const sessionsListInputSchema = v.optional(v.object({}), {});

// SHA-256 hex (64 chars) — that's what `hashToken` produces. Defensive
// upper bound on hostile input size prevents pathological work via the
// hashToken path on the receiving handler.
const sessionIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));

export const sessionsRevokeInputSchema = v.object({
  id: sessionIdSchema,
});

export const sessionsRevokeOthersInputSchema = v.optional(v.object({}), {});
