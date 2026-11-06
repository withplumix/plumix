import { eq } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { isPrivateSettingsGroup } from "../../../db/settings-groups.js";
import { settingsGroupEtag } from "../../../settings/token.js";
import { settingsGroupBag } from "../../../template-deps-core.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { settingsRpcFor } from "../../filters.js";
import { requireCapability } from "../../require-capability.js";
import { settingsGetInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";
/**
 * Double the 200-field group cap, leaving headroom for orphan keys from
 * uninstalled plugins while bounding the response.
 */
const MAX_GROUP_ROWS_PER_READ = 500;

/**
 * Settings have no decode pass: a `.returns("date")` field reads back its
 * stored ISO string, and a reference its stored id.
 */
export const get = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(settingsGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.filters.apply(
      settingsRpcFor(input.group).get.input,
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

    const copy = {
      etag: settingsGroupEtag(rows),
      values: settingsGroupBag(
        rows,
        context.plugins.settingsGroups.get(filtered.group)?.fields ?? [],
      ),
    };

    return context.filters.apply(
      settingsRpcFor(filtered.group).get.output,
      copy,
      { group: filtered.group },
    );
  });
