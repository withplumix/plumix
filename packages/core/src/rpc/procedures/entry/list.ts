import { etagOf } from "../../../db/concurrency.js";
import { listEntries } from "../../../entries/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryRpc } from "../../filters.js";
import { toRpcEntryReadError } from "./read-errors.js";
import { entryListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(entryListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.filters.apply(entryRpc.list.input, input);
    try {
      const rows = await listEntries(context, filtered);
      const output = await context.filters.apply(entryRpc.list.output, rows);
      return output.map((row) => ({ ...row, etag: etagOf(row.updatedAt) }));
    } catch (error) {
      throw toRpcEntryReadError(error, errors) ?? error;
    }
  });
