import { listEntries } from "../../../entries/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { toRpcEntryReadError } from "./read-errors.js";
import { entryListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(entryListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.list:input",
      input,
    );
    try {
      const rows = await listEntries(context, filtered);
      return await context.hooks.applyFilter("rpc:entry.list:output", rows);
    } catch (error) {
      throw toRpcEntryReadError(error, errors);
    }
  });
