import { eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { settingsGetInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

// Returns the full key → value bag for one group. Missing keys aren't
// represented — callers (admin form loaders, plugin code) fall back to
// the registered field's `default` when they need a placeholder.
export const get = base
  .use(authenticated)
  .input(settingsGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const filtered = await context.hooks.applyFilter(
      "rpc:settings.get:input",
      input,
    );

    const rows = await context.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, filtered.group));

    const bag: Record<string, unknown> = {};
    for (const row of rows) bag[row.key] = row.value;

    return context.hooks.applyFilter("rpc:settings.get:output", bag, {
      group: filtered.group,
    });
  });
