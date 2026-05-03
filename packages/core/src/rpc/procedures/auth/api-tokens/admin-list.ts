import { and, desc, eq, isNull, sql } from "../../../../db/index.js";
import { apiTokens } from "../../../../db/schema/api_tokens.js";
import { users } from "../../../../db/schema/users.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensAdminListInputSchema } from "./schemas.js";

const ADMIN_CAPABILITY = "user:manage_tokens";

// Cross-user token oversight. Returns paginated rows joined with the
// owning user (id, email, name) so the admin UI can render a single
// table without N+1-ing back to user.list. Optional `userId` filter
// for a per-user drilldown.
//
// Joins on `apiTokens.userId` → `users.id` (PK + indexed); cheap.
// `includeRevoked` toggles whether soft-deleted rows are surfaced —
// the default-false matches the "active tokens" UX, the true case
// is the audit view.
export const adminList = base
  .use(authenticated)
  .input(apiTokensAdminListInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(ADMIN_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: ADMIN_CAPABILITY } });
    }

    const filters = [
      input.userId !== undefined ? eq(apiTokens.userId, input.userId) : null,
      input.includeRevoked ? null : isNull(apiTokens.revokedAt),
    ].filter((c): c is NonNullable<typeof c> => c !== null);
    const where = filters.length > 0 ? and(...filters) : undefined;

    // Two queries (rows + total) so the UI can page without re-counting
    // client-side. `total` reflects the same WHERE — accurate for the
    // active filter set. SQLite handles count(*) over filtered rows
    // efficiently with the userId/revokedAt indexes already present.
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
      total: Number(totalRow?.count ?? 0),
      limit: input.limit,
      offset: input.offset,
    };
  });
