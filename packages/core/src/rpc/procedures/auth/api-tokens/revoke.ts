import { revokeApiToken } from "../../../../auth/api-tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensRevokeInputSchema } from "./schemas.js";

// Soft-delete (sets `revokedAt`) the user's own token. Cross-user
// attempts return NOT_FOUND with no oracle — the underlying primitive
// pins both `id` AND `userId` in the WHERE clause and returns false
// when no row matched.
//
// Idempotent: revoking an already-revoked token still surfaces
// NOT_FOUND from the user's perspective (the row is filtered by
// `revokedAt IS NULL`), which keeps the wire shape simple.
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
    );
    return { id: input.id };
  });
