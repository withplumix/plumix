import { and, desc, eq, isNull, sql } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { users } from "../../../../db/schema/users.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { requireCapability } from "../../../require-capability.js";
import { apiTokensAdminListInputSchema } from "./schemas.js";

const ADMIN_CAPABILITY = "user:manage_tokens";

/**
 * Joins the owning user so the admin table needs no per-row `user.list`
 * call. `includeRevoked` is the audit view.
 */
export const adminList = base
  .use(authenticated)
  .use(requireCapability(ADMIN_CAPABILITY))
  .input(apiTokensAdminListInputSchema)
  .handler(async ({ input, context }) => {
    const filters = [
      input.userId !== undefined ? eq(apiTokens.userId, input.userId) : null,
      input.includeRevoked ? null : isNull(apiTokens.revokedAt),
    ].filter((c): c is NonNullable<typeof c> => c !== null);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [items, totalRow] = await Promise.all([
      context.db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          prefix: apiTokens.prefix,
          scopes: apiTokens.scopes,
          expiresAt: apiTokens.expiresAt,
          lastUsedAt: apiTokens.lastUsedAt,
          createdAt: apiTokens.createdAt,
          revokedAt: apiTokens.revokedAt,
          user: {
            id: users.id,
            email: users.email,
            name: users.name,
          },
        })
        .from(apiTokens)
        .innerJoin(users, eq(users.id, apiTokens.userId))
        .where(where)
        .orderBy(desc(apiTokens.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      context.db
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(apiTokens)
        .where(where)
        .get(),
    ]);

    return {
      items,
      total: totalRow?.count ?? 0,
      limit: input.limit,
      offset: input.offset,
    };
  });
