import type { RequestAuthenticator, User } from "plumix";

/**
 * Identity of the demo admin. `id` is 1 to line up with the first user
 * the demo seed creates, so seeded content authored by that user shows as
 * the current user's in the editor. Kept in one place so the synthetic
 * session and any seed row that references it can't drift.
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
 * A `RequestAuthenticator` that treats every request as a logged-in admin,
 * with no cookie, session, or database read. This is what lets an anonymous
 * demo visitor use the full admin without a real login. The demo is
 * pre-seeded with the matching admin row, and the demo runtime blocks the
 * real auth flows, so nothing here can leak into a normal deployment.
 */
export function demoAuthenticator(): RequestAuthenticator {
  return {
    authenticate() {
      const user: User = {
        id: DEMO_ADMIN.id,
        email: DEMO_ADMIN.email,
        name: DEMO_ADMIN.name,
        avatarUrl: null,
        role: "admin",
        meta: {},
        emailVerifiedAt: DEMO_ADMIN_TIMESTAMP,
        disabledAt: null,
        createdAt: DEMO_ADMIN_TIMESTAMP,
        updatedAt: DEMO_ADMIN_TIMESTAMP,
      };
      return Promise.resolve({ user });
    },
  };
}
