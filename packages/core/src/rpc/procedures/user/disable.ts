import { invalidateAllSessionsForUser } from "../../../auth/sessions.js";
import { now } from "../../../clock.js";
import { etagOf } from "../../../db/concurrency.js";
import { and, eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { otherActiveAdminExists } from "./helpers.js";
import { userDisableInputSchema } from "./schemas.js";
import { user } from "./subject.js";

const CAPABILITY = "user:edit";

export const disable = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(userDisableInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.filters.apply(user.disableInput, input);

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }
    if (existing.disabledAt) {
      const output = await context.filters.apply(user.disableOutput, existing);
      return { ...output, etag: etagOf(existing.updatedAt) };
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
      .set({ disabledAt: now() })
      .where(whereClause)
      .returning();
    if (!updated) {
      if (existing.role === "admin") {
        throw errors.CONFLICT({ data: { reason: "last_admin" } });
      }
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    await invalidateAllSessionsForUser(context.db, updated.id);

    await context.events.emit(user.statusChanged, {
      user: updated,
      enabled: false,
    });

    const output = await context.filters.apply(user.disableOutput, updated);
    return { ...output, etag: etagOf(updated.updatedAt) };
  });
