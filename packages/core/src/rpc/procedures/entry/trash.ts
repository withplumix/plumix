import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import {
  entryDeletableGuards,
  fireEntryTrashed,
  loadDeletableEntry,
} from "./lifecycle.js";
import { entryTrashInputSchema } from "./schemas.js";

export const trash = base
  .use(authenticated)
  .input(entryTrashInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.trash:input",
      input,
    );

    const existing = await loadDeletableEntry(
      context,
      filtered.id,
      entryDeletableGuards(errors),
    );

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
