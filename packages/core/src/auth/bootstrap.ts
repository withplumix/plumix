import type { Db } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import { sql } from "../db/index.js";
import { users } from "../db/schema/users.js";

export interface BootstrappedUser {
  readonly user: User;
  readonly bootstrapped: boolean;
}

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
  const defaultRole: UserRole = input.defaultRole ?? "subscriber";

  // Role is decided inside the INSERT so concurrent first-user provisioning
  // can't elect two admins: SQLite serializes writers, and the subquery
  // observes previously-inserted rows. Only the statement that runs when
  // the table is empty gets `admin`.
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      role: sql<UserRole>`CASE WHEN (SELECT COUNT(*) FROM ${users}) = 0 THEN 'admin' ELSE ${defaultRole} END`,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
    })
    .returning();

  // eslint-disable-next-line no-restricted-syntax -- defensive driver-regression guard; migrate alongside auth errors in PR 2 (#234)
  if (!user) throw new Error("provisionUser: insert returned no row");
  return {
    user,
    bootstrapped: user.role === "admin" && defaultRole !== "admin",
  };
}
