import type { AuthSessionOutput } from "./schemas.js";
import { resolvePrincipal } from "../../../auth/principal.js";
import { sessionUserOf } from "../../../auth/session-user.js";
import { users } from "../../../db/schema/users.js";
import { base } from "../../base.js";

/**
 * Public: the admin's boot probe. Uses the configured authenticator so custom
 * ones are reflected, and reports `needsBootstrap` in the same round-trip.
 */
export const session = base.handler(
  async ({ context }): Promise<AuthSessionOutput> => {
    const authed = await resolvePrincipal(context, { kind: "configured" });
    if (authed) {
      return {
        user: sessionUserOf(authed.user, context.plugins, authed.tokenScopes),
        needsBootstrap: false,
      };
    }
    const userCount = await context.db.$count(users);
    return { user: null, needsBootstrap: userCount === 0 };
  },
);
