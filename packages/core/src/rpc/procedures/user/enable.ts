import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userEnableInputSchema } from "./schemas.js";

const CAPABILITY = "user:edit";

// Restore a previously-disabled user by clearing `disabledAt`. No
// last-admin guard here — unlike disable/delete/demote, re-enabling is
// never the path to an all-admins-locked-out state. Idempotent: a second
// call on an already-active user short-circuits with the existing row.
export const enable = base
  .use(authenticated)
  .input(userEnableInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    const filtered = await context.hooks.applyFilter(
      "rpc:user.enable:input",
      input,
    );

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }
    if (!existing.disabledAt) {
      return context.hooks.applyFilter("rpc:user.enable:output", existing);
    }

    const [updated] = await context.db
      .update(users)
      .set({ disabledAt: null })
      .where(eq(users.id, existing.id))
      .returning();
    if (!updated) {
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    // Mirrors the status_changed action fired by `user.disable` — one
    // hook covers both transitions so plugins observing "account
    // activity state changed" don't need to subscribe to two events.
    await context.hooks.doAction("user:status_changed", updated, {
      enabled: true,
    });

    return context.hooks.applyFilter("rpc:user.enable:output", updated);
  });
