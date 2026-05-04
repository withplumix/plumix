import type { SQL } from "drizzle-orm";

import type { UserRole } from "../../../db/schema/users.js";
import type { UserFieldScope } from "../../../plugin/fields/user.js";
import type { LookupAdapter, LookupResult } from "../../../plugin/lookup.js";
import { and, eq, inArray, isNull, like, or, sql } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const USER_ROW_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
} as const;

export const userLookupAdapter: LookupAdapter<UserFieldScope> = {
  async list(ctx, options) {
    const conditions = scopeConditions(options.scope);
    let limit: number;
    if (options.ids !== undefined) {
      // Resolve-by-id batch path: ignore `query` and bound the result
      // to the parsed ids. Invalid (non-numeric) ids are silently
      // dropped — they read as orphans on the caller's side. Limit
      // tracks `numericIds.length` (not `MAX_LIST_LIMIT`) because the
      // meta pipeline aggregates ids across same-`(kind,scope)` fields
      // and can legitimately request >100 in one call.
      const numericIds = options.ids
        .map((id) => parseUserId(id))
        .filter((id): id is number => id !== null);
      if (numericIds.length === 0) return [];
      conditions.push(inArray(users.id, numericIds));
      limit = numericIds.length;
    } else {
      const trimmedQuery = options.query?.trim();
      if (trimmedQuery) {
        const pattern = `%${trimmedQuery}%`;
        const queryMatch = or(
          like(users.email, pattern),
          like(users.name, pattern),
        );
        if (queryMatch) conditions.push(queryMatch);
      }
      limit = clampLimit(options.limit);
    }
    const rows = await ctx.db
      .select(USER_ROW_COLUMNS)
      .from(users)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(sql`coalesce(${users.name}, ${users.email})`)
      .limit(limit);
    return rows.map(toLookupResult);
  },

  async resolve(ctx, id, scope) {
    const numericId = parseUserId(id);
    if (numericId === null) return null;
    const [row] = await ctx.db
      .select(USER_ROW_COLUMNS)
      .from(users)
      .where(buildUserWhere(numericId, scope))
      .limit(1);
    return row ? toLookupResult(row) : null;
  },
};

function parseUserId(id: string): number | null {
  // users.id is autoincrement; reject anything that isn't a positive integer.
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function buildUserWhere(numericId: number, scope: UserFieldScope | undefined) {
  return and(eq(users.id, numericId), ...scopeConditions(scope));
}

function scopeConditions(scope: UserFieldScope | undefined): SQL[] {
  const conditions: SQL[] = [];
  if (scope?.roles && scope.roles.length > 0) {
    conditions.push(inArray(users.role, scope.roles as UserRole[]));
  }
  if (!scope?.includeDisabled) {
    conditions.push(isNull(users.disabledAt));
  }
  return conditions;
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIST_LIMIT);
}

function toLookupResult(row: {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  readonly role: UserRole;
}): LookupResult {
  const trimmedName = row.name?.trim();
  return {
    id: String(row.id),
    label:
      trimmedName !== undefined && trimmedName !== "" ? trimmedName : row.email,
    subtitle: row.name ? `${row.email} · ${row.role}` : row.role,
  };
}
