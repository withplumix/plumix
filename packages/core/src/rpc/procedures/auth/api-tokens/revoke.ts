import { revokeApiToken } from "../../../../auth/api-tokens.js";
import { auth } from "../../../../events-and-filters/auth.js";
import { sessionAuthenticated } from "../../../authenticated.js";
import { coreBase } from "../../../base.js";
import { apiTokensRevokeInputSchema } from "./schemas.js";

/**
 * Pinning both `id` and `userId` makes cross-user and already-revoked
 * attempts an indistinguishable NOT_FOUND, so there is no oracle.
 */
export const revoke = coreBase
  .meta({ removesCredential: true })
  .use(sessionAuthenticated)
  .input(apiTokensRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const ok = await revokeApiToken(context.db, {
      id: input.id,
      userId: context.user.id,
    });
    if (!ok) {
      throw errors.NOT_FOUND({ data: { kind: "api_token", id: input.id } });
    }
    await context.events.emit(auth.apiTokenRevoked, {
      apiToken: { id: input.id, userId: context.user.id },
      actor: context.user,
      mode: "self",
    });
    return { id: input.id };
  });
