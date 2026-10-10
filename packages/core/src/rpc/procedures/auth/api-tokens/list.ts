import { and, desc, eq, isNull } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensListInputSchema } from "./schemas.js";

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
