import { and, eq, isNull } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { apiTokensAdminRevokeInputSchema } from "./schemas.js";

const ADMIN_CAPABILITY = "user:manage_tokens";

/**
 * Separate from self-scope `revoke` so audit can tell an admin revoke from
 * an owner's. Soft-deletes; an already-revoked row surfaces as NOT_FOUND.
 */
export const adminRevoke = base
  .use(authenticated)
  .use(requireCapability(ADMIN_CAPABILITY))
  .input(apiTokensAdminRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const result = await context.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, input.id), isNull(apiTokens.revokedAt)))
      .returning({ id: apiTokens.id, userId: apiTokens.userId });

    const row = result[0];
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "api_token", id: input.id } });
    }
    await context.hooks.doAction(
      "api_token:revoked",
      { id: row.id, userId: row.userId },
      { actor: context.user, mode: "admin" },
      context,
    );
    return { id: input.id };
  });
