import type { Db } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import { users } from "../db/schema/users.js";

export interface BootstrappedUser {
  readonly user: User;
  /** True iff this call promoted the user to admin via the bootstrap rule. */
  readonly bootstrapped: boolean;
}

/**
 * Provision a user, automatically granting `admin` to the very first user.
 *
 * Safe because Plumix has no open registration: provisioning happens only
 * via passkey enrollment, OAuth callback, or invite — each requires the
 * deployer to wire it up.
 *
 * Note: count-then-insert is racy under concurrent provisioning. Acceptable
 * here because the bootstrap window is the first request of a fresh install;
 * a hardened path will land alongside the OAuth/invite flows.
 */
export async function provisionUser(
  db: Db,
  input: {
    readonly email: string;
    readonly name?: string | null;
    readonly avatarUrl?: string | null;
    readonly defaultRole?: UserRole;
    readonly emailVerified?: boolean;
  },
): Promise<BootstrappedUser> {
  const isFirst = (await db.$count(users)) === 0;
  const role: UserRole = isFirst
    ? "admin"
    : (input.defaultRole ?? "subscriber");

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      role,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
    })
    .returning();

  if (!user) throw new Error("provisionUser: insert returned no row");
  return { user, bootstrapped: isFirst };
}
