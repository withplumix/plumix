import { and, desc, eq, isNull } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensListInputSchema } from "./schemas.js";

// Returns the *current user's* personal access tokens. Self-scoped —
// no capability check; users always see their own tokens. Filters out
// revoked rows by default (revoked tokens stay in the DB for a future
// audit-log surface but don't clutter the management UI).
//
// Never returns the secret — that's only available at create time.
// The `prefix` field carries the recognisable fragment for UI
// identification (e.g. `pl_pat_abc1`).
export const list = base
  .use(authenticated)
  .input(apiTokensListInputSchema)
  .handler(async ({ context }) => {
    return context.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        scopes: apiTokens.scopes,
      })
      .from(apiTokens)
      .where(
        and(eq(apiTokens.userId, context.user.id), isNull(apiTokens.revokedAt)),
      )
      .orderBy(desc(apiTokens.createdAt));
  });
