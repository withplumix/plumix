import { listTerms } from "../../../terms/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { toRpcTermReadError } from "./read-errors.js";
import { termListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(termListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:term.list:input",
      input,
    );
    try {
      const rows = await listTerms(context, filtered);
      return await context.hooks.applyFilter("rpc:term.list:output", rows);
    } catch (error) {
      throw toRpcTermReadError(error, errors);
    }
  });
