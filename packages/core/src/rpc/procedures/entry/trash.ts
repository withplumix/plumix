import { etagOf } from "../../../db/concurrency.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
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
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.trash:input",
      input,
    );

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
    const output = await context.hooks.applyFilter(
      "rpc:entry.trash:output",
      result.row,
    );
    return { ...output, etag: etagOf(result.row.updatedAt) };
  });
