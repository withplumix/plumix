import { findReadableTerm } from "../../../terms/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { resolveTermMeta, settleTermMeta } from "./meta.js";
import { toRpcTermReadError } from "./read-errors.js";
import { termGetInputSchema } from "./schemas.js";

export const get = base
  .use(authenticated)
  .input(termGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    try {
      // The editor's read heals the row; the public read paths never write.
      const row = await findReadableTerm(context, input);
      const { bag } = await settleTermMeta(context, row, row.meta);
      const term = {
        ...row,
        meta: await resolveTermMeta(context, row.taxonomy, bag),
      };
      return await context.hooks.applyFilter("rpc:term.get:output", term);
    } catch (error) {
      throw toRpcTermReadError(error, errors) ?? error;
    }
  });
