import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCapability, fireEntryTrashed } from "./lifecycle.js";
import { entryTrashInputSchema } from "./schemas.js";

export const trash = base
  .use(authenticated)
  .input(entryTrashInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.trash:input",
      input,
    );

    const existing = await context.db.query.entries.findFirst({
      where: eq(entries.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    const deleteCapability = entryCapability(existing.type, "delete");
    if (!context.auth.can(deleteCapability)) {
      throw errors.FORBIDDEN({ data: { capability: deleteCapability } });
    }
    const isAuthor = existing.authorId === context.user.id;
    if (!isAuthor) {
      const editAnyCapability = entryCapability(existing.type, "edit_any");
      if (!context.auth.can(editAnyCapability)) {
        throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
      }
    }

    if (existing.status === "trash") {
      return context.hooks.applyFilter("rpc:entry.trash:output", existing);
    }

    const [trashed] = await context.db
      .update(entries)
      .set({ status: "trash" })
      .where(eq(entries.id, existing.id))
      .returning();
    if (!trashed) {
      throw errors.CONFLICT({ data: { reason: "trash_failed" } });
    }

    await fireEntryTrashed(context, trashed);
    return context.hooks.applyFilter("rpc:entry.trash:output", trashed);
  });
