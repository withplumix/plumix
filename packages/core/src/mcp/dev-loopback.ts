import type { AppContext } from "../context/app-context.js";
import { withUser } from "../auth/with-user.js";
import { asc, eq } from "../db/index.js";
import { users } from "../db/schema/users.js";

/** Stands in for the API token a dev-trusted agent never presented. */
const DEV_LOOPBACK = { id: "dev-loopback", name: "dev (loopback)" } as const;

/** An agent, not a browser: it holds an API token's credential, never a session's. */
export async function asLoopbackAdmin(ctx: AppContext): Promise<AppContext> {
  const [admin] = await ctx.db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  if (admin === undefined) return ctx;
  const { id, email, role, meta } = admin;
  return withUser(
    ctx,
    { id, email, role, meta },
    { kind: "api-token", token: DEV_LOOPBACK, scopes: null },
  );
}
