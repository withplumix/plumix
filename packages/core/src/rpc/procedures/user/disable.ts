import { invalidateAllSessionsForUser } from "../../../auth/sessions.js";
import { and, eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { otherActiveAdminExists } from "./helpers.js";
import { userDisableInputSchema } from "./schemas.js";

const CAPABILITY = "user:edit";

export const disable = base
  .use(authenticated)
  .input(userDisableInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }
    if (existing.disabledAt) {
      return context.hooks.applyFilter("rpc:user.disable:output", existing);
    }

    // Last-admin guard inlined into the WHERE clause — atomic with the write,
    // so two concurrent disables of different admins can't both pass.
    const whereClause =
      existing.role === "admin"
        ? and(
            eq(users.id, existing.id),
            otherActiveAdminExists(context.db, existing.id),
          )
        : eq(users.id, existing.id);

    const [updated] = await context.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(whereClause)
      .returning();
    if (!updated) {
      if (existing.role === "admin") {
        throw errors.CONFLICT({ data: { reason: "last_admin" } });
      }
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    await invalidateAllSessionsForUser(context.db, updated.id);

    return context.hooks.applyFilter("rpc:user.disable:output", updated);
  });
