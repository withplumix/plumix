import { isPrivateSettingsGroup } from "../../../db/settings-groups.js";
import { SettingsWriteError } from "../../../settings/errors.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { rpcSurface } from "../../concurrency.js";
import { requireCapability } from "../../require-capability.js";
import { settingsUpsertInputSchema } from "./schemas.js";

const CAPABILITY = "settings:manage";

/** Single endpoint for all group writes, through `ctx.settings.write`. */
export const upsert = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(settingsUpsertInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:settings.upsert:input",
      input,
    );
    if (isPrivateSettingsGroup(filtered.group)) {
      throw errors.BAD_REQUEST({ data: { reason: "settings_group_private" } });
    }

    const copy = await context.settings
      .write(filtered.group, filtered.values, {
        ifMatch: filtered.ifMatch,
        takeOver: filtered.takeOver,
        writer: { userId: context.user.id, surface: rpcSurface(context) },
      })
      .catch((error: unknown) => {
        if (error instanceof SettingsWriteError) {
          throw errors.CONFLICT({ data: error.data });
        }
        throw error;
      });

    return context.hooks.applyFilter(
      "rpc:settings.upsert:output",
      copy,
      {
        group: filtered.group,
      },
      context,
    );
  });
