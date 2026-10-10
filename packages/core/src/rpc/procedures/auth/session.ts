import type { AuthSessionOutput } from "./schemas.js";
import { authenticateTraced } from "../../../auth/authenticator.js";
import { capabilitiesForRole } from "../../../auth/rbac.js";
import { users } from "../../../db/schema/users.js";
import { base } from "../../base.js";

/**
 * Public: the admin's boot probe. Uses the configured authenticator so custom
 * ones are reflected, and reports `needsBootstrap` in the same round-trip.
 */
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
