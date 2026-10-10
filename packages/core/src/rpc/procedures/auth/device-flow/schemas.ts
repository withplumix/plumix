import * as v from "valibot";

// Accepts either case and a missing dash for pasting, then normalises to
// the canonical "ABCD-EFGH" the server primitive expects.
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

const capabilitySchema = v.pipe(
  v.string(),
  v.minLength(1, "capability must be non-empty"),
  v.maxLength(96, "capability must be ≤ 96 chars"),
  v.regex(/^[A-Za-z0-9_:.\-*]+$/, "capability uses [A-Za-z0-9_:.\\-*] only"),
);

// `null` inherits the role's caps; an array narrows the token to its
// intersection with the role. `[]` is legal, as in `api_tokens.scopes`.
// Capped against a hostile approver.
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
