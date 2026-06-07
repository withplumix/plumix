import { and, eq, inArray, like, or } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { AUTOSAVE_TYPE, REVISION_TYPE } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
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
    const toTrash = rows.filter((row) => row.status !== "trash");
    if (toTrash.length === 0) return { ids: [] };

    const ids = toTrash.map((row) => row.id);
    await context.db
      .update(entries)
      .set({ status: "trash" })
      .where(inArray(entries.id, ids));

    for (const row of toTrash) {
      await fireEntryTrashed(context, { ...row, status: "trash" });
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
    const toRestore = rows.filter((row) => row.status === "trash");
    if (toRestore.length === 0) return { ids: [] };

    const ids = toRestore.map((row) => row.id);
    await context.db
      .update(entries)
      .set({ status: "draft" })
      .where(inArray(entries.id, ids));

    for (const row of toRestore) {
      await fireEntryRestored(context, { ...row, status: "draft" });
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
    // Revision / autosave rows are linked by slug encoding, not FK, so
    // clear them in one batched statement before the entries themselves.
    const slugClauses = ids.flatMap((id) => [
      and(
        eq(entries.type, REVISION_TYPE),
        like(entries.slug, `revision:${String(id)}:%`),
      ),
      and(
        eq(entries.type, AUTOSAVE_TYPE),
        like(entries.slug, `autosave:${String(id)}:%`),
      ),
    ]);
    await context.db.delete(entries).where(or(...slugClauses));
    await context.db.delete(entries).where(inArray(entries.id, ids));

    for (const row of rows) {
      await fireEntryDeleted(context, row);
    }
    return { ids };
  });
