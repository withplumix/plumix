import { options } from "../../../db/schema/options.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { optionSetInputSchema } from "./schemas.js";

const CAPABILITY = "option:manage";

export const set = base
  .use(authenticated)
  .input(optionSetInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    const filtered = await context.hooks.applyFilter(
      "rpc:option.set:input",
      input,
    );

    const update: { value: string; isAutoloaded?: boolean } = {
      value: filtered.value,
    };
    if (filtered.isAutoloaded !== undefined) {
      update.isAutoloaded = filtered.isAutoloaded;
    }

    const [upserted] = await context.db
      .insert(options)
      .values({
        name: filtered.name,
        value: filtered.value,
        isAutoloaded: filtered.isAutoloaded ?? true,
      })
      .onConflictDoUpdate({
        target: options.name,
        set: update,
      })
      .returning();
    if (!upserted) {
      throw errors.CONFLICT({ data: { reason: "upsert_failed" } });
    }

    return context.hooks.applyFilter("rpc:option.set:output", upserted);
  });
