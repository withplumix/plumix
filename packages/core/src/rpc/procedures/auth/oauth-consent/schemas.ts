import * as v from "valibot";

import { authorizationParamsSchema } from "../../../../auth/oauth-server/authorization-request.js";

export const oauthConsentLookupInputSchema = authorizationParamsSchema;

export const oauthConsentDenyInputSchema = authorizationParamsSchema;

/**
 * `capabilities` narrows the requested scope; omitted, the whole scope is
 * granted. Anything outside the scope is dropped, not refused.
 */
export const oauthConsentApproveInputSchema = v.object({
  ...authorizationParamsSchema.entries,
  capabilities: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.maxLength(96))),
      v.maxLength(1024, "≤ 1024 capabilities"),
    ),
  ),
});
