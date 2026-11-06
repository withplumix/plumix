import { checkOAuthGrant } from "../../../../auth/oauth-server/grants.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthConsentLookupInputSchema } from "./schemas.js";
import { validatedRequest } from "./validated.js";

/**
 * `covered` tells a person who signed in on the way here that `/authorize`
 * will now skip consent.
 */
export const lookup = base
  .use(sessionAuthenticated)
  .input(oauthConsentLookupInputSchema)
  .handler(async ({ input, context, errors }) => {
    const request = await validatedRequest(context, input, errors);
    const { name, host, logoUri, loopbackOnly } = request.client;
    const { requested, covered } = await checkOAuthGrant(
      context.db,
      context.plugins,
      context.user,
      request,
    );
    return {
      client: { name, host, logoUri: logoUri ?? null, loopbackOnly },
      scope: request.scope,
      capabilities: [...requested],
      covered,
    };
  });
