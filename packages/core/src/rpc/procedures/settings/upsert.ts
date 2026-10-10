import { sql } from "drizzle-orm";

import type { JsonValue } from "../../../json.js";
import type { MetaFieldError } from "../../../meta/field-pipeline.js";
import type { ConflictErrors } from "../../../rpc-errors.js";
import { and, eq, inArray } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { isPrivateSettingsGroup } from "../../../db/settings-groups.js";
import { decodeJsonValue } from "../../../meta/coerce.js";
import { runFieldPipeline } from "../../../meta/field-pipeline.js";
import { isConditionHidden } from "../../../plugin/fields/condition.js";
import { startingMeta } from "../../../plugin/fields/starting-meta.js";
import {
  SETTINGS_CREATED_KEY,
  settingsGroupBag,
} from "../../../template-deps-core.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import {
  MAX_SETTINGS_VALUE_BYTES,
  settingsUpsertInputSchema,
} from "./schemas.js";

const CAPABILITY = "settings:manage";

/**
 * Single endpoint for all group writes. Keys mapped to `null` or
 * `undefined` are deletions; anything else is an upsert. Unmentioned
 * keys are left alone — same partial-patch semantic as `entry.meta`.
 */
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

    // Registered fields go through the meta write pipeline. Condition-hidden
    // fields are dropped first: a value the editor cannot see must not persist.
    const group = context.plugins.settingsGroups.get(filtered.group);
    const groupFields = new Map((group?.fields ?? []).map((f) => [f.key, f]));

    // A group counts as created on its first save, which writes every field and
    // a marker row, so from then on a cleared setting stays absent.
    let values = filtered.values;
    let creating = false;
    if (group) {
      const storedKeys = new Set(
        (
          await context.db
            .select({ key: settings.key })
            .from(settings)
            .where(eq(settings.group, filtered.group))
        ).map((row) => row.key),
      );
      if (!storedKeys.has(SETTINGS_CREATED_KEY)) {
        creating = true;
        const starting = Object.entries(startingMeta(group.fields)).filter(
          ([key]) => !storedKeys.has(key),
        );
        values = { ...Object.fromEntries(starting), ...filtered.values };
      }
    }

    const deletes: string[] = [];
    // Not `NewSetting`: the insert type leaves `value` optional and
    // nullable, and `settings:group_changed` ships these rows as a
    // `SettingsBag`, which admits neither.
    const upsertRows: { group: string; key: string; value: JsonValue }[] = [];
    const fieldErrors: MetaFieldError[] = [];
    for (const [key, value] of Object.entries(values)) {
      // Reserved: only the first save writes it.
      if (key === SETTINGS_CREATED_KEY) continue;
      const field = groupFields.get(key);
      if (field && isConditionHidden(field, values)) continue;

      let stored: JsonValue | undefined;
      if (field) {
        const result = await runFieldPipeline(field, value, key);
        if (result.errors.length > 0) {
          fieldErrors.push(...result.errors);
          continue;
        }
        if (result.isDeletion === true) {
          deletes.push(key);
          continue;
        }
        stored = result.value;
      } else {
        // No field declares what an orphan key holds, so the only constraint
        // left is that the value is JSON.
        if (value === null || value === undefined) {
          deletes.push(key);
          continue;
        }
        stored = decodeJsonValue(value);
        if (stored === undefined) {
          throw errors.CONFLICT({
            data: {
              reason: "settings_invalid_value",
              key: `${filtered.group}.${key}`,
            },
          });
        }
      }
      // A `.sanitize()` callback returning nothing leaves nothing to write.
      if (stored === undefined) continue;
      upsertRows.push({ group: filtered.group, key, value: stored });
    }
    // Runs before the size check so a validation failure is never masked by an
    // oversized sibling.
    const [firstError] = fieldErrors;
    if (firstError) {
      throw errors.CONFLICT({
        data: {
          reason: "settings_invalid_value",
          key: `${filtered.group}.${firstError.path.split(".")[0] ?? firstError.path}`,
          errors: fieldErrors,
        },
      });
    }
    for (const row of upsertRows) {
      assertEncodedSize(row.group, row.key, row.value, errors);
    }

    if (deletes.length > 0) {
      await context.db
        .delete(settings)
        .where(
          and(
            eq(settings.group, filtered.group),
            inArray(settings.key, deletes),
          ),
        );
    }
    const writtenRows = creating
      ? [
          ...upsertRows,
          { group: filtered.group, key: SETTINGS_CREATED_KEY, value: true },
        ]
      : upsertRows;
    if (writtenRows.length > 0) {
      await context.db
        .insert(settings)
        .values(writtenRows)
        .onConflictDoUpdate({
          target: [settings.group, settings.key],
          set: { value: sql`excluded.value` },
        });
    }

    // Re-read the authoritative bag and ship it back + to the output
    // filter so plugins can observe the final shape in one place.
    const fresh = await context.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.group, filtered.group));
    // `null` is a value the column can hold, so it stays in the bag.
    const bag = settingsGroupBag(fresh, group?.fields ?? []);

    // Fire only when the call actually changed state — an empty
    // `values: {}` payload is a no-op and shouldn't wake up
    // cache-invalidators / audit-log subscribers.
    if (upsertRows.length > 0 || deletes.length > 0) {
      await context.hooks.doAction(
        "settings:group_changed",
        {
          group: filtered.group,
          set: Object.fromEntries(upsertRows.map((r) => [r.key, r.value])),
          removed: deletes,
        },
        context,
      );
    }

    return context.hooks.applyFilter(
      "rpc:settings.upsert:output",
      bag,
      {
        group: filtered.group,
      },
      context,
    );
  });

/**
 * Values that blow past the per-value cap in `schemas.ts` translate to a
 * CONFLICT with a keyed `reason` so admin UIs surface which field hit
 * the limit.
 */
function assertEncodedSize(
  group: string,
  key: string,
  value: JsonValue,
  errors: ConflictErrors,
): void {
  const byteLength = new TextEncoder().encode(JSON.stringify(value)).length;
  if (byteLength > MAX_SETTINGS_VALUE_BYTES) {
    throw errors.CONFLICT({
      data: { reason: "settings_value_too_large", key: `${group}.${key}` },
    });
  }
}
