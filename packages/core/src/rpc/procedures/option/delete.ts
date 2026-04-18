import { eq } from "../../../db/index.js";
import { options } from "../../../db/schema/options.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { optionDeleteInputSchema } from "./schemas.js";

const CAPABILITY = "option:manage";

export const del = base
  .use(authenticated)
  .input(optionDeleteInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const [deleted] = await context.db
      .delete(options)
      .where(eq(options.name, input.name))
      .returning();
    if (!deleted) {
      throw errors.NOT_FOUND({ data: { kind: "option", id: input.name } });
    }
    return context.hooks.applyFilter("rpc:option.delete:output", deleted);
  });
