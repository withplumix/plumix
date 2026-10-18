import { etagOf } from "../../../db/concurrency.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { writeAsSystem } from "./concurrency.js";
import {
  entryDeletableGuards,
  fireEntryRestored,
  loadDeletableEntry,
} from "./lifecycle.js";
import { entryRestoreInputSchema } from "./schemas.js";

export const restore = base
  .use(authenticated)
  .input(entryRestoreInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.restore:input",
      input,
    );

    const existing = await loadDeletableEntry(
      context,
      filtered.id,
      entryDeletableGuards(errors),
    );

    const result = await writeAsSystem(context.db, existing, (row) =>
      row.status === "trash" ? { status: "draft" } : undefined,
    );
    if (!result) {
      throw errors.CONFLICT({ data: { reason: "restore_failed" } });
    }
    if (!result.written) {
      throw errors.CONFLICT({ data: { reason: "not_trashed" } });
    }
    const restored = result.row;

    await fireEntryRestored(context, restored);
    const output = await context.hooks.applyFilter(
      "rpc:entry.restore:output",
      restored,
    );
    return { ...output, etag: etagOf(restored.updatedAt) };
  });
