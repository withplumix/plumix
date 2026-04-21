import { inArray } from "../../../db/index.js";
import { options } from "../../../db/schema/options.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { optionGetManyInputSchema } from "./schemas.js";

const CAPABILITY = "option:manage";

/**
 * Fetch multiple options in one round-trip — the shape the settings
 * form's loader wants (one request to hydrate every field in a group).
 * Returns a keyed map rather than an array; missing names simply don't
 * appear, mirroring `option.get`'s NOT_FOUND semantics without the
 * per-miss throw. Callers fall back to the field's `default` when a
 * name is absent.
 */
export const getMany = base
  .use(authenticated)
  .input(optionGetManyInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const rows = await context.db
      .select()
      .from(options)
      .where(inArray(options.name, input.names));

    const result: Record<string, string> = {};
    for (const row of rows) result[row.name] = row.value;
    return context.hooks.applyFilter("rpc:option.getMany:output", result);
  });
