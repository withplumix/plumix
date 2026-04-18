import { eq } from "../../../db/index.js";
import { options } from "../../../db/schema/options.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { optionGetInputSchema } from "./schemas.js";

const CAPABILITY = "option:manage";

export const get = base
  .use(authenticated)
  .input(optionGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const row = await context.db.query.options.findFirst({
      where: eq(options.name, input.name),
    });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "option", id: input.name } });
    }
    return context.hooks.applyFilter("rpc:option.get:output", row);
  });
