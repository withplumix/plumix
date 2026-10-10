import { revokeApiToken } from "../../../../auth/api-tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensRevokeInputSchema } from "./schemas.js";

/**
 * Pinning both `id` and `userId` makes cross-user and already-revoked
 * attempts an indistinguishable NOT_FOUND, so there is no oracle.
 */
export const revoke = base
  .use(authenticated)
  .input(apiTokensRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const ok = await revokeApiToken(context.db, {
      id: input.id,
      userId: context.user.id,
    });
    if (!ok) {
      throw errors.NOT_FOUND({ data: { kind: "api_token", id: input.id } });
    }
    await context.hooks.doAction(
      "api_token:revoked",
      { id: input.id, userId: context.user.id },
      { actor: context.user, mode: "self" },
      context,
    );
    return { id: input.id };
  });
