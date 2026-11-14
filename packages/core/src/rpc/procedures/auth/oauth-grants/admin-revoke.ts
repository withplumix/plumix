import { revokeOAuthGrant } from "../../../../auth/oauth-server/grants.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { coreBase } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { oauthGrantsAdminRevokeInputSchema } from "./schemas.js";

export const adminRevoke = coreBase
  .meta({ removesCredential: true })
  .use(sessionAuthenticated)
  .use(requireCapability("user:manage_tokens"))
  .input(oauthGrantsAdminRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!(await revokeOAuthGrant(context.db, input))) {
      throw errors.NOT_FOUND({ data: { kind: "oauth_grant", id: input.id } });
    }
    return { id: input.id };
  });
