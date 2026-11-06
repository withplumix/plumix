import type { AppContext } from "../context/app-context.js";
import type { AuthResult } from "../context/authenticator.js";
import { withUser } from "../auth/with-user.js";
import { asc, eq } from "../db/index.js";
import { users } from "../db/schema/users.js";

/** Stands in for the API token a dev-trusted agent never presented. */
const DEV_LOOPBACK = { id: "dev-loopback", name: "dev (loopback)" } as const;

/**
 * The authenticator is replaced too, since the procedures a write tool calls
 * authenticate again. With no admin yet, the context stays anonymous.
 */
export async function asLoopbackAdmin(ctx: AppContext): Promise<AppContext> {
  const [admin] = await ctx.db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  if (admin === undefined) return ctx;
  const result: AuthResult = {
    user: admin,
    credential: "api-token",
    tokenScopes: null,
    apiToken: DEV_LOOPBACK,
  };
  const { id, email, role, meta } = admin;
  return withUser(
    { ...ctx, authenticator: { authenticate: () => Promise.resolve(result) } },
    { id, email, role, meta },
    null,
    DEV_LOOPBACK,
  );
}
