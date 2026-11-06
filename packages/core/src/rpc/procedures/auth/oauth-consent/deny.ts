import { authorizationResponseUrl } from "../../../../auth/oauth-server/authorization-request.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { oauthConsentDenyInputSchema } from "./schemas.js";
import { validatedRequest } from "./validated.js";

/** Sends the browser back to the client with RFC 6749's `access_denied`. */
export const deny = base
  .use(authenticated)
  .input(oauthConsentDenyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const request = await validatedRequest(context, input, errors);
    return {
      redirectTo: authorizationResponseUrl(context, request, {
        error: "access_denied",
      }),
    };
  });
