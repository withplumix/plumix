import type { AuthSessionOutput } from "./schemas.js";
import { authenticateTraced } from "../../../auth/authenticator.js";
import { capabilitiesForRole } from "../../../auth/rbac.js";
import { users } from "../../../db/schema/users.js";
import { base } from "../../base.js";

// Public (no `authenticated` middleware). This is the admin's boot probe: it
// resolves the current user through the configured authenticator — the same
// guard every other path uses, so a custom authenticator (SSO, demo) is
// reflected here too — otherwise null, and tells the UI whether the instance
// needs bootstrapping so we can route to /bootstrap vs /login in one round-trip.
export const session = base.handler(
  async ({ context }): Promise<AuthSessionOutput> => {
    const result = await authenticateTraced(context, context.authenticator);
    if (result) {
      const { id, email, name, avatarUrl, role } = result.user;
      return {
        user: {
          id,
          email,
          name,
          avatarUrl,
          role,
          capabilities: [...capabilitiesForRole(role, context.plugins)],
        },
        needsBootstrap: false,
      };
    }
    const userCount = await context.db.$count(users);
    return { user: null, needsBootstrap: userCount === 0 };
  },
);
