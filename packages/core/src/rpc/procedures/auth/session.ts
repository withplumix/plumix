import type { AuthSessionOutput } from "./schemas.js";
import { readSessionCookie } from "../../../auth/cookies.js";
import { validateSession } from "../../../auth/sessions.js";
import { users } from "../../../db/schema/users.js";
import { base } from "../../base.js";

// Public (no `authenticated` middleware). This is the admin's boot probe: it
// returns the current user when a valid session cookie is present, otherwise
// null — and tells the UI whether the instance needs bootstrapping so we can
// route to /bootstrap vs /login without a separate round-trip.
export const session = base.handler(
  async ({ context }): Promise<AuthSessionOutput> => {
    const token = readSessionCookie(context.request);
    if (token) {
      const validated = await validateSession(context.db, token);
      if (validated) {
        const { id, email, name, avatarUrl, role } = validated.user;
        return {
          user: { id, email, name, avatarUrl, role },
          needsBootstrap: false,
        };
      }
    }
    const userCount = await context.db.$count(users);
    return { user: null, needsBootstrap: userCount === 0 };
  },
);
