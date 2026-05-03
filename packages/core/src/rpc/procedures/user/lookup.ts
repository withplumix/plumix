import type { SQL } from "drizzle-orm";

import type { UserRole } from "../../../db/schema/users.js";
import type { LookupAdapter, LookupResult } from "../../../plugin/lookup.js";
import { and, eq, inArray, isNull, like, or, sql } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";

// Pluggable scope config for the `user` reference field. Carried on
// the field's `referenceTarget.scope` and passed verbatim into each
// adapter call. Keeping this as a public type lets future variants
// (`userList`) reuse the same shape unchanged.
export interface UserLookupScope {
  /** Restrict matches to these roles. Empty/absent → any role. */
  readonly roles?: readonly UserRole[];
  /**
   * Whether to surface disabled accounts. Default `false` — disabled
   * users are usually invalid reference targets even though the row
   * still exists.
   */
  readonly includeDisabled?: boolean;
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const USER_ROW_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
} as const;

export const userLookupAdapter: LookupAdapter<UserLookupScope> = {
  async exists(ctx, id, scope) {
    const numericId = parseUserId(id);
    if (numericId === null) return false;
    const row = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(buildUserWhere(numericId, scope))
      .limit(1);
    return row.length > 0;
  },

  async list(ctx, options) {
    const conditions = scopeConditions(options.scope);
    const trimmedQuery = options.query?.trim();
    if (trimmedQuery) {
      const pattern = `%${trimmedQuery}%`;
      const queryMatch = or(
        like(users.email, pattern),
        like(users.name, pattern),
      );
      if (queryMatch) conditions.push(queryMatch);
    }
    const rows = await ctx.db
      .select(USER_ROW_COLUMNS)
      .from(users)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(sql`coalesce(${users.name}, ${users.email})`)
      .limit(clampLimit(options.limit));
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

function buildUserWhere(numericId: number, scope: UserLookupScope | undefined) {
  return and(eq(users.id, numericId), ...scopeConditions(scope));
}

function scopeConditions(scope: UserLookupScope | undefined): SQL[] {
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
