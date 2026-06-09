import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
import type { AdminSearchInput, SearchGroup } from "./admin-search.js";
import { and, asc, not, sql } from "../db/index.js";
import { users } from "../db/schema/users.js";
import {
  escapeLikePattern,
  tokenizeSearchQuery,
} from "../rpc/procedures/entry/search-terms.js";

// Group priority base, after entries (10..) and terms (100..).
const PRIORITY_BASE = 200;

// Reuses the existing nav label so the group localizes via the admin
// catalog with no new message.
const USERS_LABEL = { id: "core.adminNav.item.users", message: "Users" };

/**
 * `admin:search:results` handler for the `users` domain. Gated by the
 * single `user:list` capability; matches name+email (LIKE) and returns one
 * "Users" group. Names are optional, so the email is the fallback title.
 */
export async function usersSearchHandler(
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  const tokens = tokenizeSearchQuery(input.query);
  if (tokens.length === 0) return [];
  if (!ctx.auth.can("user:list")) return [];

  const rows = await ctx.db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(...tokens.map(nameEmailCondition)))
    .orderBy(asc(users.email))
    .limit(input.limit);
  if (rows.length === 0) return [];

  return [
    {
      key: "users",
      label: USERS_LABEL,
      priority: PRIORITY_BASE,
      items: rows.map((row) => ({
        id: String(row.id),
        title: row.name ?? row.email,
        ...(row.name ? { subtitle: row.email } : {}),
      })),
    },
  ];
}

function nameEmailCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  const match = sql`(
    COALESCE(${users.name}, '') LIKE ${pattern} ESCAPE '\\'
    OR ${users.email} LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
