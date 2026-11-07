import { revokeOAuthGrant } from "../../../../auth/oauth-server/grants.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthGrantsRevokeInputSchema } from "./schemas.js";

/** Another person's grant is NOT_FOUND, like one that doesn't exist. */
export const revoke = base
  .use(authenticated)
  .input(oauthGrantsRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const revoked = await revokeOAuthGrant(context.db, {
      id: input.id,
      userId: context.user.id,
    });
    if (!revoked) {
      throw errors.NOT_FOUND({ data: { kind: "oauth_grant", id: input.id } });
    }
    return { id: input.id };
  });
