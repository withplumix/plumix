import { resolveScope } from "../../../../auth/oauth-server/scopes.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthConsentLookupInputSchema } from "./schemas.js";
import { validatedRequest } from "./validated.js";

export const lookup = base
  .use(authenticated)
  .input(oauthConsentLookupInputSchema)
  .handler(async ({ input, context, errors }) => {
    const request = await validatedRequest(context, input, errors);
    const { name, host, logoUri, loopbackOnly } = request.client;
    return {
      client: { name, host, logoUri: logoUri ?? null, loopbackOnly },
      scope: request.scope,
      capabilities: [
        ...resolveScope(request.scope, context.user.role, context.plugins),
      ],
    };
  });
