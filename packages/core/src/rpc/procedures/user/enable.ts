import { etagOf } from "../../../db/concurrency.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { userEnableInputSchema } from "./schemas.js";

const CAPABILITY = "user:edit";

/** No last-admin guard: re-enabling can never lock admins out. */
export const enable = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(userEnableInputSchema)
  .handler(async ({ input, context, errors }) => {
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
      const output = await context.hooks.applyFilter(
        "rpc:user.enable:output",
        existing,
      );
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

    // One `user:status_changed` hook covers enable and disable, so plugins
    // observing "account activity state changed" don't need two events.
    await context.hooks.doAction(
      "user:status_changed",
      updated,
      {
        enabled: true,
      },
      context,
    );

    // A system write: the token moves without a copy to check.
    const output = await context.hooks.applyFilter(
      "rpc:user.enable:output",
      updated,
    );
    return { ...output, etag: etagOf(updated.updatedAt) };
  });
