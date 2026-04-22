import { eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { settingsGetInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";
// Hard ceiling on rows returned per group. Registered-field count per
// group is already capped at 200 (`MAX_FIELDS_PER_SETTINGS_GROUP` in
// plugin/context); doubling it here gives headroom for orphan keys
// left by uninstalled plugins while still bounding response size.
const MAX_GROUP_ROWS_PER_READ = 500;

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
      .where(eq(settings.group, filtered.group))
      .limit(MAX_GROUP_ROWS_PER_READ);

    const bag: Record<string, unknown> = {};
    for (const row of rows) bag[row.key] = row.value;

    return context.hooks.applyFilter("rpc:settings.get:output", bag, {
      group: filtered.group,
    });
  });
