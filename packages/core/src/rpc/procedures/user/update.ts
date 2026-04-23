import type { NewUser } from "../../../db/schema/users.js";
import { invalidateAllSessionsForUser } from "../../../auth/sessions.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { isEmptyMetaPatch } from "../../meta/core.js";
import { stripUndefined } from "../entry/helpers.js";
import { otherActiveAdminExists } from "./helpers.js";
import {
  decodeMetaBag,
  loadUserMeta,
  sanitizeMetaForRpc,
  writeUserMeta,
} from "./meta.js";
import { userUpdateInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";
const PROMOTE_CAPABILITY = "user:promote";

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

    const isSelf = existing.id === context.user.id;
    const canEdit = isSelf
      ? context.auth.can(EDIT_OWN_CAPABILITY)
      : context.auth.can(EDIT_CAPABILITY);
    if (!canEdit) {
      throw errors.FORBIDDEN({
        data: { capability: isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY },
      });
    }

    // Role changes are a separate privilege — even self-edits can't promote.
    const wantsRoleChange =
      filtered.role !== undefined && filtered.role !== existing.role;
    if (wantsRoleChange && !context.auth.can(PROMOTE_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: PROMOTE_CAPABILITY } });
    }
    const demotingAdmin =
      wantsRoleChange && existing.role === "admin" && filtered.role !== "admin";

    // `meta` isn't a users.* column — split it out and validate up
    // front so a bad key fails before any write.
    const { id: _id, meta: metaInput, ...changes } = filtered;
    const metaPatch = sanitizeMetaForRpc(context.plugins, metaInput, errors);
    const patch: Partial<NewUser> = stripUndefined(changes);

    // Nothing to write anywhere? Return the existing row with its
    // decoded meta for a consistent response shape.
    if (Object.keys(patch).length === 0 && isEmptyMetaPatch(metaPatch)) {
      const meta = decodeMetaBag(context.plugins, existing.meta);
      return context.hooks.applyFilter("rpc:user.update:output", {
        ...existing,
        meta,
      });
    }

    // Last-admin guard inlined into the UPDATE WHERE clause: the row only
    // updates if another active admin still exists at write time. Closes a
    // TOCTOU race where two concurrent demotions could each pass a separate
    // "isLastActiveAdmin" check and both succeed, locking everyone out.
    const whereClause = demotingAdmin
      ? and(
          eq(users.id, existing.id),
          otherActiveAdminExists(context.db, existing.id),
        )
      : eq(users.id, existing.id);

    let updated = existing;
    let rowWritten = false;
    if (Object.keys(patch).length > 0) {
      let row;
      try {
        [row] = await context.db
          .update(users)
          .set(patch)
          .where(whereClause)
          .returning();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw errors.CONFLICT({ data: { reason: "email_taken" } });
        }
        throw error;
      }
      if (!row) {
        if (demotingAdmin) {
          throw errors.CONFLICT({ data: { reason: "last_admin" } });
        }
        throw errors.CONFLICT({ data: { reason: "update_failed" } });
      }
      updated = row;
      rowWritten = true;
    }

    // Match the early-return's empty-patch gate — an explicit `meta: {}`
    // from the client produces a non-null but empty `MetaPatch`, and a
    // plain `loadUserMeta` re-read for that case is just a wasted SELECT.
    let meta: Record<string, unknown>;
    if (metaPatch !== null && !isEmptyMetaPatch(metaPatch)) {
      await writeUserMeta(context, updated, metaPatch);
      meta = await loadUserMeta(context, updated);
    } else {
      meta = decodeMetaBag(context.plugins, updated.meta);
    }

    // Any role change → existing sessions carry a cached role via AppContext
    // until they expire. Invalidate so the next request re-auths and picks up
    // the new role (tightens demotions immediately; upgrades, too).
    if (wantsRoleChange) {
      await invalidateAllSessionsForUser(context.db, updated.id);
    }

    // WP's `profile_update` parity — plugins observe successful row writes
    // with the previous row for diffing. Skipped on meta-only saves —
    // subscribe to `user:meta_changed` for that surface.
    if (rowWritten) {
      await context.hooks.doAction("user:updated", updated, existing);
    }

    return context.hooks.applyFilter("rpc:user.update:output", {
      ...updated,
      meta,
    });
  });
