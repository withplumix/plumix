import * as v from "valibot";

// User_code shape: 8 alphanumeric chars in two groups of 4, separated
// by a dash. We accept either case + missing dash (paste-friendliness)
// and normalise on the way in. The server-side primitive expects the
// canonical "ABCD-EFGH" form.
const userCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.transform((value) => {
    // Accept "ABCDEFGH" by re-injecting the dash. Reject anything that
    // doesn't end up as exactly 9 chars (8 alphanums + dash).
    const stripped = value.replace(/-/g, "");
    return stripped.length === 8
      ? `${stripped.slice(0, 4)}-${stripped.slice(4)}`
      : value;
  }),
  v.regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "user code must be 8 alphanum chars"),
);

const tokenNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "name must be non-empty"),
  v.maxLength(64, "name must be ≤ 64 chars"),
  v.regex(/^[^\r\n]+$/, "name must not contain newlines"),
);

// Capability strings — `entry:post:read`, `settings:manage`, etc.
// Conservatively bounded: capability namespaces are typically short
// and bounded by `${prefix}:${subject}:${action}` so 96 chars is
// generous. Reject empty strings and obvious junk via the regex —
// no whitespace or newlines, only printable ASCII that capabilities
// in core/plugin code use.
const capabilitySchema = v.pipe(
  v.string(),
  v.minLength(1, "capability must be non-empty"),
  v.maxLength(96, "capability must be ≤ 96 chars"),
  v.regex(/^[A-Za-z0-9_:.\-*]+$/, "capability uses [A-Za-z0-9_:.\\-*] only"),
);

// Per-token scope whitelist. null = inherit role caps (default);
// non-null = the minted token is narrowed to the intersection of
// these caps with the user's role. Cap the array so a hostile
// approver can't store an arbitrarily-large scope list.
//
// Empty array `[]` is legal — same semantic as `api_tokens.scopes`
// (token authenticates but grants no caps). See that schema's
// header for the audit-log continuity rationale.
const scopesSchema = v.optional(
  v.union([
    v.null(),
    v.pipe(v.array(capabilitySchema), v.maxLength(128, "≤ 128 scopes")),
  ]),
  null,
);

export const deviceFlowLookupInputSchema = v.object({
  userCode: userCodeSchema,
});

export const deviceFlowApproveInputSchema = v.object({
  userCode: userCodeSchema,
  tokenName: tokenNameSchema,
  scopes: scopesSchema,
});

export const deviceFlowDenyInputSchema = v.object({
  userCode: userCodeSchema,
});
