import { getTerm } from "../../../terms/read-service.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { toRpcTermReadError } from "./read-errors.js";
import { termGetInputSchema } from "./schemas.js";

export const get = base
  .use(authenticated)
  .input(termGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    try {
      const term = await getTerm(context, input);
      return await context.hooks.applyFilter("rpc:term.get:output", term);
    } catch (error) {
      throw toRpcTermReadError(error, errors);
    }
  });
