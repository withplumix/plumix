import { listTerms } from "../../../terms/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { termRpc } from "../../filters.js";
import { termWire } from "./helpers.js";
import { toRpcTermReadError } from "./read-errors.js";
import { termListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(termListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.filters.apply(termRpc.list.input, input);
    try {
      const rows = await listTerms(context, filtered);
      const output = await context.filters.apply(termRpc.list.output, rows);
      return output.map(termWire);
    } catch (error) {
      throw toRpcTermReadError(error, errors) ?? error;
    }
  });
