import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { deleteEntriesHistory } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import {
  entryDeletableGuards,
  fireEntryDeleted,
  loadDeletableEntry,
} from "./lifecycle.js";
import { entryDeletePermanentInputSchema } from "./schemas.js";

export const deletePermanent = base
  .use(authenticated)
  .input(entryDeletePermanentInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.deletePermanent:input",
      input,
    );

    const existing = await loadDeletableEntry(
      context,
      filtered.id,
      entryDeletableGuards(errors),
    );

    if (existing.status !== "trash") {
      throw errors.CONFLICT({ data: { reason: "not_trashed" } });
    }

    // entry_term rows cascade via FK, children re-root via
    // `ON DELETE SET NULL`; the entry's history has no FK to follow.
    await deleteEntriesHistory(context.db, [existing.id]);
    await context.db.delete(entries).where(eq(entries.id, existing.id));

    await fireEntryDeleted(context, existing);
    return context.hooks.applyFilter(
      "rpc:entry.deletePermanent:output",
      existing,
    );
  });
