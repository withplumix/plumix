import { etagOf } from "../../../db/concurrency.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { requireCapability } from "../../require-capability.js";
import { assertCanActOnUser, userWrite } from "./helpers.js";
import { userEnableInputSchema } from "./schemas.js";
import { user } from "./subject.js";

const CAPABILITY = "user:edit";

/** No last-admin guard: re-enabling can never lock admins out. */
export const enable = userWrite
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(userEnableInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.filters.apply(user.enableInput, input);

    const existing = await context.db.query.users.findFirst({
      where: eq(users.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }
    assertCanActOnUser(context, existing, {
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    });
    if (!existing.disabledAt) {
      const output = await context.filters.apply(user.enableOutput, existing);
      return { ...output, etag: etagOf(existing.updatedAt) };
    }

    const [updated] = await context.db
      .update(users)
      .set({ disabledAt: null })
      .where(eq(users.id, existing.id))
      .returning();
    if (!updated) {
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    await context.events.emit(user.statusChanged, {
      user: updated,
      enabled: true,
    });

    const output = await context.filters.apply(user.enableOutput, updated);
    return { ...output, etag: etagOf(updated.updatedAt) };
  });
