import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { NewUser, User } from "../../../db/schema/users.js";
import type { JsonObject } from "../../../json.js";
import type { AccessGuards } from "./helpers.js";
import { invalidateAllSessionsForUser } from "../../../auth/sessions.js";
import { claim, ConflictError, etagOf } from "../../../db/concurrency.js";
import { assertWritable } from "../../../db/edit-lease.js";
import {
  and,
  eq,
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
} from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { isEmptyMetaPatch, patchedMetaBag } from "../../../meta/core.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { rpcSurface } from "../entry/concurrency.js";
import { stripUndefined } from "../entry/helpers.js";
import { assertCanEditUser, otherActiveAdminExists } from "./helpers.js";
import {
  announceUserMetaChange,
  assertUserMetaCapabilities,
  resolveUserMeta,
  sanitizeMetaForRpc,
  validateUserMetaReferences,
} from "./meta.js";
import { userUpdateInputSchema } from "./schemas.js";

const PROMOTE_CAPABILITY = "user:promote";

interface UserWriteGuards {
  readonly slugTaken: () => never;
  readonly emailTaken: () => never;
  readonly lastAdmin: () => never;
  readonly updateFailed: () => never;
}

function assertCanChangeRole(
  context: AuthenticatedAppContext,
  guards: AccessGuards,
): void {
  if (!context.auth.can(PROMOTE_CAPABILITY))
    guards.forbidden(PROMOTE_CAPABILITY);
}

/**
 * The whole save as one guarded update: the columns, the meta merged from the
 * row the save read, and the token claimed from `ifMatch`.
 */
async function writeGuarded(
  context: AuthenticatedAppContext,
  existing: User,
  ifMatch: Date,
  changes: Partial<NewUser>,
  demotingAdmin: boolean,
  guards: UserWriteGuards,
): Promise<User> {
  const guard = claim(users.updatedAt, ifMatch);
  // The last-admin guard sits in the UPDATE's WHERE so two concurrent
  // demotions can't both pass and lock everyone out.
  const whereClause = and(
    eq(users.id, existing.id),
    guard.where,
    demotingAdmin ? otherActiveAdminExists(context.db, existing.id) : undefined,
  );

  let row;
  try {
    [row] = await context.db
      .update(users)
      .set({ ...changes, ...guard.set })
      .where(whereClause)
      .returning();
  } catch (error) {
    // `users.email` isn't writable here, but a plugin filter could reintroduce
    // it.
    if (isUniqueConstraintErrorOn(error, "users.slug")) guards.slugTaken();
    if (isUniqueConstraintError(error)) guards.emailTaken();
    throw error;
  }
  if (row) return row;
  const [current] = await context.db
    .select({ updatedAt: users.updatedAt })
    .from(users)
    .where(eq(users.id, existing.id));
  if (current && current.updatedAt.getTime() !== ifMatch.getTime()) {
    throw new ConflictError(current.updatedAt, {
      kind: "user",
      id: existing.id,
    });
  }
  if (current && demotingAdmin) guards.lastAdmin();
  return guards.updateFailed();
}

export const update = base
  .use(authenticated)
  .input(userUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:user.update:input",
      input,
    );

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: filtered.id } });
    }

    const accessGuards: AccessGuards = {
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    };
    assertCanEditUser(context, existing, accessGuards);
    // After auth, so an unauthorised caller with a stale copy still gets
    // FORBIDDEN, not CONFLICT or LOCKED.
    await assertWritable(
      context.db,
      { kind: "user", id: existing.id },
      { userId: context.user.id, surface: rpcSurface(context) },
      { takeOver: filtered.takeOver },
    );
    if (filtered.ifMatch.getTime() !== existing.updatedAt.getTime()) {
      throw new ConflictError(existing.updatedAt, {
        kind: "user",
        id: existing.id,
      });
    }

    // Role changes are a separate privilege — even self-edits can't promote.
    const wantsRoleChange =
      filtered.role !== undefined && filtered.role !== existing.role;
    if (wantsRoleChange) {
      assertCanChangeRole(context, accessGuards);
    }
    const demotingAdmin =
      wantsRoleChange && existing.role === "admin" && filtered.role !== "admin";

    // `meta` isn't a users.* column — split it out and validate up
    // front so a bad key fails before any write.
    const {
      id: _id,
      meta: metaInput,
      ifMatch,
      takeOver: _takeOver,
      ...changes
    } = filtered;
    const metaPatch = await sanitizeMetaForRpc(
      context.plugins,
      metaInput,
      { stored: existing.meta, auth: context.auth },
      errors,
    );
    if (metaPatch) {
      assertUserMetaCapabilities(
        context.plugins,
        metaPatch,
        context.auth,
        errors,
      );
      await validateUserMetaReferences(context, metaPatch, errors);
    }
    const patch: Partial<NewUser> = stripUndefined(changes);

    // Nothing to write anywhere? Return the existing row with its
    // decoded meta for a consistent response shape.
    const metaChanged = !isEmptyMetaPatch(metaPatch);
    if (Object.keys(patch).length === 0 && !metaChanged) {
      const meta = await resolveUserMeta(context, existing.meta);
      const output = await context.hooks.applyFilter("rpc:user.update:output", {
        ...existing,
        meta,
      });
      return { ...output, etag: etagOf(existing.updatedAt) };
    }

    const merged: JsonObject | undefined = metaChanged
      ? patchedMetaBag(existing.meta, metaPatch)
      : undefined;
    const updated = await writeGuarded(
      context,
      existing,
      ifMatch,
      merged === undefined ? patch : { ...patch, meta: merged },
      demotingAdmin,
      {
        slugTaken: () => {
          throw errors.CONFLICT({ data: { reason: "slug_taken" } });
        },
        emailTaken: () => {
          throw errors.CONFLICT({ data: { reason: "email_taken" } });
        },
        lastAdmin: () => {
          throw errors.CONFLICT({ data: { reason: "last_admin" } });
        },
        updateFailed: () => {
          throw errors.CONFLICT({ data: { reason: "update_failed" } });
        },
      },
    );

    // Only once the claim holds, so a refused save announces nothing.
    if (metaPatch && metaChanged) {
      await announceUserMetaChange(context, updated, metaPatch);
    }
    const meta = await resolveUserMeta(context, updated.meta);

    // Sessions cache the role until they expire, so invalidate them to apply
    // any role change immediately.
    if (wantsRoleChange) {
      await invalidateAllSessionsForUser(context.db, updated.id);
    }

    // WP's `profile_update` parity — plugins observe successful row writes
    // with the previous row for diffing. Skipped on meta-only saves —
    // subscribe to `user:meta_changed` for that surface.
    if (Object.keys(patch).length > 0) {
      await context.hooks.doAction("user:updated", updated, existing, context);
    }

    const output = await context.hooks.applyFilter("rpc:user.update:output", {
      ...updated,
      meta,
    });
    return { ...output, etag: etagOf(updated.updatedAt) };
  });
