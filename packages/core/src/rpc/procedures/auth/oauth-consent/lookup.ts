import {
  findOAuthGrant,
  oauthGrantCovers,
} from "../../../../auth/oauth-server/grants.js";
import { resolveScope } from "../../../../auth/oauth-server/scopes.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthConsentLookupInputSchema } from "./schemas.js";
import { validatedRequest } from "./validated.js";

/**
 * `covered` tells a person who signed in on the way here that `/authorize`
 * will now skip consent. It resolves the caller as `/authorize` does, so the
 * two never disagree.
 */
export const lookup = base
  .use(sessionAuthenticated)
  .input(oauthConsentLookupInputSchema)
  .handler(async ({ input, context, errors }) => {
    const request = await validatedRequest(context, input, errors);
    const { name, host, logoUri, loopbackOnly } = request.client;
    const capabilities = resolveScope(
      request.scope,
      context.user.role,
      context.plugins,
    );
    const granted = await findOAuthGrant(
      context.db,
      context.user.id,
      request.client.clientId,
    );
    return {
      client: { name, host, logoUri: logoUri ?? null, loopbackOnly },
      scope: request.scope,
      capabilities: [...capabilities],
      covered: granted !== null && oauthGrantCovers(granted, capabilities),
    };
  });
