import { authenticateTraced, tokenScopesOf } from "../auth/authenticator.js";
import { withUser } from "../auth/with-user.js";
import { ConflictError } from "../db/concurrency.js";
import { LockedError, readEditLease } from "../db/edit-lease.js";
import { base } from "./base.js";

export const authenticated = base.middleware(
  async ({ context, next, errors }) => {
    // Same authenticator the raw routes use, so a request authed for one path
    // is authed for the other.
    const result = await authenticateTraced(context, context.authenticator);
    if (!result) throw errors.UNAUTHORIZED();

    const { id, email, role, meta } = result.user;
    const tokenScopes = tokenScopesOf(result);
    try {
      return await next({
        context: withUser(context, { id, email, role, meta }, tokenScopes),
      });
    } catch (error) {
      // A guarded write below, core's or a plugin's, refuses a stale copy by
      // throwing `ConflictError`; the wire sees one `CONFLICT` for it.
      if (error instanceof ConflictError) {
        const lease = error.resource
          ? await readEditLease(context.db, error.resource)
          : undefined;
        throw errors.CONFLICT({
          data: { ...error.data, holder: lease?.holder },
        });
      }
      if (error instanceof LockedError) {
        throw errors.LOCKED({ data: error.data });
      }
      throw error;
    }
  },
);
