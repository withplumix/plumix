import type {
  AuthenticatedAppContext,
  Db,
} from "../../../context/app-context.js";
import type { BadRequestErrors } from "../../../rpc-errors.js";
import {
  capabilitiesForRole,
  getCapabilityResolver,
} from "../../../auth/rbac.js";
import { and, eq, exists, isNull, ne } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { base } from "../../base.js";

/**
 * The builder for a procedure that changes a user. Its mark lets a test find
 * every one; each calls `assertCanActOnUser` on the user it loads.
 */
export const userWrite = base
  .$meta<{ readonly modifiesUser?: true }>({})
  .meta({ modifiesUser: true });

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

/** Refuses a role that is neither a default nor declared in the config. */
export function assertDeclaredRole(
  context: AuthenticatedAppContext,
  role: string | undefined,
  errors: BadRequestErrors,
): void {
  if (role === undefined) return;
  if (getCapabilityResolver(context.plugins).hasRole(role)) return;
  throw errors.BAD_REQUEST({ data: { reason: "unknown_role" } });
}

/**
 * Refuses a role granting a capability the actor doesn't hold, so nobody
 * assigns past themselves.
 */
export function assertCanAssignRole(
  context: AuthenticatedAppContext,
  role: string | undefined,
  guards: AccessGuards,
): void {
  if (role === undefined) return;
  assertHoldsRole(context, role, guards);
}

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

export interface AccessGuards {
  readonly forbidden: (capability: string) => never;
}

/**
 * Refuses acting on another user who holds a capability the actor lacks, so
 * nobody acts past themselves. Acting on yourself is left to the caller.
 */
export function assertCanActOnUser(
  context: AuthenticatedAppContext,
  target: { readonly id: number; readonly role: string },
  guards: AccessGuards,
): void {
  if (target.id === context.user.id) return;
  assertHoldsRole(context, target.role, guards);
}

function assertHoldsRole(
  context: AuthenticatedAppContext,
  role: string,
  guards: AccessGuards,
): void {
  const missing = capabilitiesForRole(role, context.plugins).find(
    (capability) => !context.auth.can(capability),
  );
  if (missing !== undefined) guards.forbidden(missing);
}

export function assertCanEditUser(
  context: AuthenticatedAppContext,
  existing: { readonly id: number; readonly role: string },
  guards: AccessGuards,
): void {
  const isSelf = existing.id === context.user.id;
  const capability = isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY;
  if (!context.auth.can(capability)) guards.forbidden(capability);
  assertCanActOnUser(context, existing, guards);
}
