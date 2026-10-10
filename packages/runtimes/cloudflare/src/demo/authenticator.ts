import type { RequestAuthenticator } from "plumix";
import type { User } from "plumix/schema";

import { hasDemoSession, readDemoToken } from "./session.js";

/**
 * `id` 1 matches the first user the demo seed creates, so seeded content shows
 * as the current user's.
 */
export const DEMO_ADMIN = {
  id: 1,
  email: "demo@plumix.example",
  name: "Demo Editor",
} as const;

// Stable synthetic timestamps: the demo admin isn't a real account, so its
// "created"/"verified" instants shouldn't advance on every request.
const DEMO_ADMIN_TIMESTAMP = new Date();

/**
 * Any visitor with the session cookie is admin, with no database read.
 * Cookieless traffic stays anonymous so it can't edit the shared showcase.
 */
export function demoAuthenticator(): RequestAuthenticator {
  return {
    authenticate(request) {
      if (!readDemoToken(request)) return Promise.resolve(null);
      const user: User = {
        id: DEMO_ADMIN.id,
        email: DEMO_ADMIN.email,
        slug: "demo-editor",
        name: DEMO_ADMIN.name,
        avatarUrl: null,
        role: "admin",
        meta: {},
        emailVerifiedAt: DEMO_ADMIN_TIMESTAMP,
        disabledAt: null,
        createdAt: DEMO_ADMIN_TIMESTAMP,
        updatedAt: DEMO_ADMIN_TIMESTAMP,
      };
      return Promise.resolve({ user, credential: "session" });
    },
    // The demo session lives in the `plumix_demo` cookie, not `plumix_session`.
    hasSession(request) {
      return hasDemoSession(request);
    },
  };
}
