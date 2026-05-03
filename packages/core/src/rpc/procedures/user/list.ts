import { and, desc, eq, like, sql } from "../../../db/index.js";
import { sessions } from "../../../db/schema/sessions.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userListInputSchema } from "./schemas.js";

const CAPABILITY = "user:list";

export const list = base
  .use(authenticated)
  .input(userListInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    const filtered = await context.hooks.applyFilter(
      "rpc:user.list:input",
      input,
    );

    const conditions = [];
    if (filtered.role) conditions.push(eq(users.role, filtered.role));
    if (filtered.search && filtered.search.length > 0) {
      conditions.push(like(users.email, `%${filtered.search}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // `lastSignInAt` is a correlated subselect, evaluated once per
    // outer row. Single SQL statement; the existing
    // `sessions_user_id_idx` makes the per-row lookup an index seek.
    // Returns null when the user has never signed in — the admin's
    // users-table renders that as "Never".
    //
    // Drizzle's `${col}` interpolation emits the bare column name
    // without the table qualifier (`"user_id"` not `"sessions"."user_id"`).
    // Inside the subquery scope, the unqualified `"user_id"` would
    // resolve to `sessions.user_id` and the outer `users.id` would
    // shadow as the inner `sessions.id` (a hash) — both columns
    // exist in the inner scope, so the predicate compares the
    // wrong fields and returns null. Use `sql.identifier` to emit
    // table-qualified references.
    const sessionsUserId = sql`${sql.identifier("sessions")}.${sql.identifier(
      "user_id",
    )}`;
    const sessionsCreatedAt = sql`${sql.identifier(
      "sessions",
    )}.${sql.identifier("created_at")}`;
    const usersId = sql`${sql.identifier("users")}.${sql.identifier("id")}`;

    // The raw driver returns the subselect's MAX as a unix-epoch
    // integer (the underlying column is `integer({ mode: "timestamp" })`,
    // but drizzle's timestamp coercion only applies when reading a
    // schema-typed column directly — `sql<...>` expressions bypass it).
    // Type as `number | null` here and lift to `Date | null` in JS so
    // the wire shape matches the rest of the row's timestamp fields.
    const raw = await context.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: users.role,
        meta: users.meta,
        emailVerifiedAt: users.emailVerifiedAt,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignInEpoch: sql<number | null>`(
          SELECT MAX(${sessionsCreatedAt})
          FROM ${sessions}
          WHERE ${sessionsUserId} = ${usersId}
        )`.as("lastSignInEpoch"),
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    const rows = raw.map(({ lastSignInEpoch, ...rest }) => ({
      ...rest,
      lastSignInAt:
        lastSignInEpoch === null ? null : new Date(lastSignInEpoch * 1000),
    }));

    return context.hooks.applyFilter("rpc:user.list:output", rows);
  });
