import { and, eq, isNull } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensAdminRevokeInputSchema } from "./schemas.js";

const ADMIN_CAPABILITY = "user:manage_tokens";

// Admin-only revoke for any user's token. Soft-delete (sets
// `revokedAt`) so the row stays for the future audit-log surface.
//
// Distinct from the self-scope `revoke` procedure — same underlying
// table mutation, but a separate procedure name lets future
// telemetry/audit cleanly distinguish "user X revoked their own
// token" from "admin Y revoked user X's token". Idempotent: a row
// already in `revokedAt IS NOT NULL` is filtered by the WHERE
// clause and surfaces as NOT_FOUND.
export const adminRevoke = base
  .use(authenticated)
  .input(apiTokensAdminRevokeInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(ADMIN_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: ADMIN_CAPABILITY } });
    }

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
    );
    return { id: input.id };
  });
