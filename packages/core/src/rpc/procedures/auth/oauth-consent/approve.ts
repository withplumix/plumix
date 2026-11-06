import { authorizationResponseUrl } from "../../../../auth/oauth-server/authorization-request.js";
import {
  issueAuthorizationCode,
  saveGrant,
} from "../../../../auth/oauth-server/grants.js";
import { resolveScope } from "../../../../auth/oauth-server/scopes.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthConsentApproveInputSchema } from "./schemas.js";
import { validatedRequest } from "./validated.js";

/**
 * Stores the scope resolved against the person's role, narrowed to the
 * capabilities they kept, and returns where to send the browser with the code.
 */
export const approve = base
  .use(sessionAuthenticated)
  .input(oauthConsentApproveInputSchema)
  .handler(async ({ input, context, errors }) => {
    const request = await validatedRequest(context, input, errors);
    const resolved = resolveScope(
      request.scope,
      context.user.role,
      context.plugins,
    );
    const kept =
      input.capabilities === undefined ? null : new Set(input.capabilities);
    const scopes =
      kept === null
        ? resolved
        : resolved.filter((capability) => kept.has(capability));

    await saveGrant(context.db, {
      userId: context.user.id,
      clientId: request.client.clientId,
      scopes,
    });
    const code = await issueAuthorizationCode(context.db, {
      userId: context.user.id,
      request,
      scopes,
    });
    return {
      redirectTo: authorizationResponseUrl(context, request, { code }),
    };
  });
