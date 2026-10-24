import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { Entry } from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { assertCanDeleteEntry } from "../../../entries/editability.js";
import { deleteEntriesHistory } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { fireEntryDeleted } from "./lifecycle.js";
import { entryDeletePermanentInputSchema } from "./schemas.js";
import { writeErrors as errors } from "./writes-shared.js";

/**
 * `entry.deletePermanent` and `ctx.entries.delete`; `gate` is the procedure's
 * check of the loaded row.
 */
export async function deleteEntry(
  context: AuthenticatedAppContext,
  id: number,
  gate?: (existing: Entry) => void,
): Promise<Entry> {
  const existing = await loadAuthoredEntry(context.db, id);
  if (!existing) throw errors.NOT_FOUND({ data: { kind: "entry", id } });
  gate?.(existing);

  // entry_term rows cascade via FK, children re-root via
  // `ON DELETE SET NULL`; the entry's history has no FK to follow.
  await deleteEntriesHistory(context.db, [existing.id]);
  await context.db.delete(entries).where(eq(entries.id, existing.id));

  await fireEntryDeleted(context, existing);
  return existing;
}

export const deletePermanent = base
  .use(authenticated)
  .input(entryDeletePermanentInputSchema)
  .handler(async ({ input, context }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.deletePermanent:input",
      input,
    );

    const existing = await deleteEntry(context, filtered.id, (row) => {
      assertCanDeleteEntry(context, row, errors);
      if (row.status !== "trash") {
        throw errors.CONFLICT({ data: { reason: "not_trashed" } });
      }
    });
    return context.hooks.applyFilter(
      "rpc:entry.deletePermanent:output",
      existing,
    );
  });
