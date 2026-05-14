import type { drizzle } from "drizzle-orm/libsql";

import type * as schema from "../../db/schema/index.js";
import type { User, UserRole } from "../../db/schema/users.js";
import { SESSION_COOKIE_NAME } from "../../auth/cookies.js";
import { createSession } from "../../auth/sessions.js";
import { userFactory } from "../factories.js";

type PlaygroundDb = ReturnType<typeof drizzle<typeof schema>>;

export interface ActingAsResult {
  readonly user: User;
  readonly storageState: {
    readonly cookies: readonly {
      readonly name: string;
      readonly value: string;
      readonly domain: string;
      readonly path: string;
      readonly expires: number;
      readonly httpOnly: boolean;
      readonly secure: boolean;
      readonly sameSite: "Lax" | "Strict" | "None";
    }[];
    readonly origins: readonly [];
  };
}

/**
 * Seed an authenticated user against a real worker-backed playground D1
 * and package the resulting session as a Playwright `storageState` so a
 * subsequent `browser.newContext({ storageState })` walks the admin
 * shell already logged in.
 *
 * Mirrors the vitest-side `harness.actingAs` (factory → `createSession`
 * → request with cookie), but stops at the storageState boundary so
 * Playwright owns the cookie injection. **Skips the WebAuthn / passkey
 * ceremony entirely** — the helper writes through the production
 * `createSession` code path (no auth bypass at the data layer), but the
 * UI affordance that a real user goes through is short-circuited. Use
 * only from `globalSetup` or test fixtures; never from production code.
 *
 * `userOrRole`: when a string, a fresh user is created via
 * `userFactory.transient({ db })` with that role. When a `User` object,
 * the existing user is reused but a fresh session is minted.
 *
 * @experimental Part of the worker-driven plugin e2e helpers landing in
 *   #251. Signature may shift as the pattern propagates to other
 *   plugins (#252-#256).
 */
export async function actingAs(
  db: PlaygroundDb,
  userOrRole: User | UserRole,
): Promise<ActingAsResult> {
  const user: User =
    typeof userOrRole === "string"
      ? await userFactory.transient({ db }).create({ role: userOrRole })
      : userOrRole;
  const { token } = await createSession(db, { userId: user.id });
  return {
    user,
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: token,
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  };
}
