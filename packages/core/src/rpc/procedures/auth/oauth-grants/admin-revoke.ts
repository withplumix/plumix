import { revokeOAuthGrant } from "../../../../auth/oauth-server/grants.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { oauthGrantsAdminRevokeInputSchema } from "./schemas.js";

export const adminRevoke = base
  .use(authenticated)
  .use(requireCapability("user:manage_tokens"))
  .input(oauthGrantsAdminRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!(await revokeOAuthGrant(context.db, input))) {
      throw errors.NOT_FOUND({ data: { kind: "oauth_grant", id: input.id } });
    }
    return { id: input.id };
  });
