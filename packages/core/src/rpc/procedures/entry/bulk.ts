import { inArray } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { deleteEntriesHistory } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { writeAsSystem } from "./concurrency.js";
import {
  entryDeletableGuards,
  fireEntryDeleted,
  fireEntryRestored,
  fireEntryTrashed,
  loadDeletableEntries,
} from "./lifecycle.js";
import {
  entryDeletePermanentManyInputSchema,
  entryRestoreManyInputSchema,
  entryTrashManyInputSchema,
} from "./schemas.js";

export const trashMany = base
  .use(authenticated)
  .input(entryTrashManyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const rows = await loadDeletableEntries(
      context,
      input.ids,
      entryDeletableGuards(errors),
    );
    // Skip rows already in the trash — bulk trash is idempotent, mirroring
    // the single-row no-op.
    const ids: number[] = [];
    for (const read of rows) {
      const result = await writeAsSystem(context.db, read, (row) =>
        row.status === "trash" ? undefined : { status: "trash" },
      );
      if (!result?.written) continue;
      ids.push(result.row.id);
      await fireEntryTrashed(context, result.row);
    }
    return { ids };
  });

export const restoreMany = base
  .use(authenticated)
  .input(entryRestoreManyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const rows = await loadDeletableEntries(
      context,
      input.ids,
      entryDeletableGuards(errors),
    );
    // Only trashed rows are restorable; others are skipped (the trash
    // view never mixes statuses, this is the defensive backstop).
    const ids: number[] = [];
    for (const read of rows) {
      const result = await writeAsSystem(context.db, read, (row) =>
        row.status === "trash" ? { status: "draft" } : undefined,
      );
      if (!result?.written) continue;
      ids.push(result.row.id);
      await fireEntryRestored(context, result.row);
    }
    return { ids };
  });

export const deletePermanentMany = base
  .use(authenticated)
  .input(entryDeletePermanentManyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const rows = await loadDeletableEntries(
      context,
      input.ids,
      entryDeletableGuards(errors),
    );
    // Permanent delete is unrecoverable — fail-all if any selected row
    // isn't trashed, matching the single-row guard.
    if (rows.some((row) => row.status !== "trash")) {
      throw errors.CONFLICT({ data: { reason: "not_trashed" } });
    }

    const ids = rows.map((row) => row.id);
    await deleteEntriesHistory(context.db, ids);
    await context.db.delete(entries).where(inArray(entries.id, ids));

    for (const row of rows) {
      await fireEntryDeleted(context, row);
    }
    return { ids };
  });
