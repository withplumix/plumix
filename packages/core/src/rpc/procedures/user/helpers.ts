import type {
  AuthenticatedAppContext,
  Db,
} from "../../../context/app-context.js";
import { and, eq, exists, isNull, ne } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";

/**
 * Use as a WHERE predicate on the write itself, so two concurrent demotions
 * can't both pass a read-then-write check.
 */
export function otherActiveAdminExists(db: Db, excludeUserId: number) {
  return exists(
    db
      .select({ v: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "admin"),
          isNull(users.disabledAt),
          ne(users.id, excludeUserId),
        ),
      ),
  );
}

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

export interface AccessGuards {
  readonly forbidden: (capability: string) => never;
}

export function assertCanEditUser(
  context: AuthenticatedAppContext,
  existing: { readonly id: number },
  guards: AccessGuards,
): void {
  const isSelf = existing.id === context.user.id;
  const capability = isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY;
  if (!context.auth.can(capability)) guards.forbidden(capability);
}
