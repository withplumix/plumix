import * as v from "valibot";

import { tokenScopesSchema } from "../api-tokens/schemas.js";

/**
 * Accepts either case and a missing dash for pasting, then normalises to
 * the canonical "ABCD-EFGH" the server primitive expects.
 */
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

export const deviceFlowLookupInputSchema = v.object({
  userCode: userCodeSchema,
});

export const deviceFlowApproveInputSchema = v.object({
  userCode: userCodeSchema,
  tokenName: tokenNameSchema,
  scopes: tokenScopesSchema,
});

export const deviceFlowDenyInputSchema = v.object({
  userCode: userCodeSchema,
});
