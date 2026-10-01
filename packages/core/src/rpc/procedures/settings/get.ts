import type { JsonValue } from "../../../json.js";
import { eq } from "../../../db/index.js";
import { settings, SETTINGS_CREATED_KEY } from "../../../db/schema/settings.js";
import { isPrivateSettingsGroup } from "../../../db/settings-groups.js";
import { startingMeta } from "../../../plugin/fields/starting-meta.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { settingsGetInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";
// Hard ceiling on rows returned per group. Registered-field count per
// group is already capped at 200 (`MAX_FIELDS_PER_SETTINGS_GROUP` in
// plugin/validation/meta-box-fields); doubling it here gives headroom for orphan keys
// left by uninstalled plugins while still bounding response size.
const MAX_GROUP_ROWS_PER_READ = 500;

// Returns the full key → value bag for one group. A group counts as created on
// its first save (ADR 0026), which writes the `__plumix_created` marker. Until
// then its fields' starting values stand in where storage has no key, so the
// form opens on them and the first save writes them. After it, storage alone
// is the truth and a cleared setting stays absent.
//
// Settings have no decode pass of their own: a `.returns("date")` settings
// field reads back its stored ISO string, and a reference its stored id.
export const get = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(settingsGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:settings.get:input",
      input,
    );
    if (isPrivateSettingsGroup(filtered.group)) {
      throw errors.BAD_REQUEST({ data: { reason: "settings_group_private" } });
    }

    const rows = await context.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, filtered.group))
      .limit(MAX_GROUP_ROWS_PER_READ);

    const stored: Record<string, JsonValue> = {};
    let created = false;
    for (const row of rows) {
      if (row.key === SETTINGS_CREATED_KEY) created = true;
      else stored[row.key] = row.value;
    }
    const bag = created
      ? stored
      : {
          ...startingMeta(
            context.plugins.settingsGroups.get(filtered.group)?.fields ?? [],
          ),
          ...stored,
        };

    return context.hooks.applyFilter(
      "rpc:settings.get:output",
      bag,
      {
        group: filtered.group,
      },
      context,
    );
  });
