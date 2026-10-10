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
 * Seed a user and session in the playground D1 and return it as a Playwright
 * `storageState`. Skips the passkey ceremony, so call it only from test setup.
 *
 * @experimental
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
