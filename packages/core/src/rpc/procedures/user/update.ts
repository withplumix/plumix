import type { NewUser } from "../../../db/schema/users.js";
import { invalidateAllSessionsForUser } from "../../../auth/sessions.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { stripUndefined } from "../post/helpers.js";
import { otherActiveAdminExists } from "./helpers.js";
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

    const { id: _id, ...changes } = filtered;
    const patch: Partial<NewUser> = stripUndefined(changes);
    if (Object.keys(patch).length === 0) {
      return context.hooks.applyFilter("rpc:user.update:output", existing);
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

    let updated;
    try {
      [updated] = await context.db
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
    if (!updated) {
      if (demotingAdmin) {
        throw errors.CONFLICT({ data: { reason: "last_admin" } });
      }
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    // Any role change → existing sessions carry a cached role via AppContext
    // until they expire. Invalidate so the next request re-auths and picks up
    // the new role (tightens demotions immediately; upgrades, too).
    if (wantsRoleChange) {
      await invalidateAllSessionsForUser(context.db, updated.id);
    }

    return context.hooks.applyFilter("rpc:user.update:output", updated);
  });
