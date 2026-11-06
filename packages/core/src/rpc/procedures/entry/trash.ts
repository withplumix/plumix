import { etagOf } from "../../../db/concurrency.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryRpc } from "../../filters.js";
import { entryRows } from "./concurrency.js";
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
    const filtered = await context.filters.apply(entryRpc.trash.input, input);

    const existing = await loadDeletableEntry(
      context,
      filtered.id,
      entryDeletableGuards(errors),
    );

    const result = await entryRows(context.db).writeAsSystem(existing, (row) =>
      row.status === "trash" ? undefined : { status: "trash" },
    );
    if (!result) {
      throw errors.CONFLICT({ data: { reason: "trash_failed" } });
    }

    if (result.written) await fireEntryTrashed(context, result.row);
    const output = await context.filters.apply(
      entryRpc.trash.output,
      result.row,
    );
    return { ...output, etag: etagOf(result.row.updatedAt) };
  });
