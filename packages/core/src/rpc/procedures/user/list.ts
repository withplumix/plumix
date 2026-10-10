import { and, desc, eq, like, sql } from "../../../db/index.js";
import { sessions } from "../../../db/schema/sessions.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { userListInputSchema } from "./schemas.js";

const CAPABILITY = "user:list";

export const list = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(userListInputSchema)
  .handler(async ({ input, context }) => {
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

    // Drizzle's `${col}` emits unqualified column names, which inside this
    // subquery resolve to the wrong `sessions` columns, so `sql.identifier`
    // qualifies them.
    const sessionsUserId = sql`${sql.identifier("sessions")}.${sql.identifier(
      "user_id",
    )}`;
    const sessionsCreatedAt = sql`${sql.identifier(
      "sessions",
    )}.${sql.identifier("created_at")}`;
    const usersId = sql`${sql.identifier("users")}.${sql.identifier("id")}`;

    // `sql<...>` expressions bypass drizzle's timestamp coercion, so MAX comes
    // back as unix-epoch seconds and is lifted to `Date` in JS.
    const raw = await context.db
      .select({
        id: users.id,
        email: users.email,
        slug: users.slug,
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
