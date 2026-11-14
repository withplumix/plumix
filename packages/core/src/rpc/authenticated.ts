import type { PrincipalPolicy } from "../auth/principal.js";
import { resolvePrincipal } from "../auth/principal.js";
import { ConflictError } from "../db/concurrency.js";
import { LockedError, readEditLease } from "../db/edit-lease.js";
import { base } from "./base.js";

const resolvedBy = (policy: PrincipalPolicy) =>
  base.middleware(async ({ context, next, errors }) => {
    const authed = await resolvePrincipal(context, policy);
    if (!authed) throw errors.UNAUTHORIZED();

    try {
      return await next({ context: authed });
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
  });

/**
 * Same policy the raw routes use, so a request authed for one path is authed
 * for the other.
 */
export const authenticated = resolvedBy({ kind: "configured" });

/**
 * For a procedure that creates or redirects a credential: an API-token caller
 * reads as anonymous, however its context was resolved (ADR 0024).
 */
export const sessionAuthenticated = resolvedBy({ kind: "session" });
