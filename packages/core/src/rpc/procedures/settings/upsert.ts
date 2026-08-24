import { sql } from "drizzle-orm";

import type { JsonValue } from "../../../json.js";
import type { RpcErrorsForMeta } from "../../meta/core.js";
import type { MetaFieldError } from "../../meta/field-pipeline.js";
import { and, eq, inArray } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { isConditionHidden } from "../../../plugin/fields/condition.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { decodeJsonValue } from "../../meta/coerce.js";
import { runFieldPipeline } from "../../meta/field-pipeline.js";
import {
  MAX_SETTINGS_VALUE_BYTES,
  settingsUpsertInputSchema,
} from "./schemas.js";

const CAPABILITY = "settings:manage";

// Single endpoint for all group writes. Keys mapped to `null` or
// `undefined` are deletions; anything else is an upsert. Unmentioned
// keys are left alone — same partial-patch semantic as `entry.meta`.
export const upsert = base
  .use(authenticated)
  .input(settingsUpsertInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const filtered = await context.hooks.applyFilter(
      "rpc:settings.upsert:input",
      input,
    );

    // A registered field's declared type is what the column ends up
    // holding, so every value it owns goes through the same write
    // pipeline as entry/term meta — coercion, `.sanitize()`, declared
    // constraints. Condition-hidden fields are dropped before that: a
    // value the editor cannot see must not persist.
    const groupFields = new Map(
      (context.plugins.settingsGroups.get(filtered.group)?.fields ?? []).map(
        (f) => [f.key, f],
      ),
    );

    const deletes: string[] = [];
    // Not `NewSetting`: the insert type leaves `value` optional and
    // nullable, and `settings:group_changed` ships these rows as a
    // `SettingsBag`, which admits neither.
    const upsertRows: { group: string; key: string; value: JsonValue }[] = [];
    const fieldErrors: MetaFieldError[] = [];
    for (const [key, value] of Object.entries(filtered.values)) {
      const field = groupFields.get(key);
      if (field && isConditionHidden(field, filtered.values)) continue;

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
        // No field declares what an unregistered key holds — an orphan left
        // by an uninstalled plugin, or a group nobody declared — so the write
        // stays laissez-faire. The column still names what it holds, which
        // makes JSON the one thing the value has to be.
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
    // Nothing is written when any key fails — the admin form addresses
    // every offending input in one round-trip, as it does for meta. This
    // runs before the size check so a validation failure is never masked
    // by an oversized sibling.
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
    if (upsertRows.length > 0) {
      await context.db
        .insert(settings)
        .values(upsertRows)
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
    const bag: Record<string, JsonValue> = {};
    // `null` is a value the column can hold, so it stays in the bag.
    for (const row of fresh) bag[row.key] = row.value;

    // Fire only when the call actually changed state — an empty
    // `values: {}` payload is a no-op and shouldn't wake up
    // cache-invalidators / audit-log subscribers.
    if (upsertRows.length > 0 || deletes.length > 0) {
      await context.hooks.doAction("settings:group_changed", {
        group: filtered.group,
        set: Object.fromEntries(upsertRows.map((r) => [r.key, r.value])),
        removed: deletes,
      });
    }

    return context.hooks.applyFilter("rpc:settings.upsert:output", bag, {
      group: filtered.group,
    });
  });

// Values that blow past the per-value cap in `schemas.ts` translate to a
// CONFLICT with a keyed `reason` so admin UIs surface which field hit
// the limit.
function assertEncodedSize(
  group: string,
  key: string,
  value: JsonValue,
  errors: RpcErrorsForMeta,
): void {
  const byteLength = new TextEncoder().encode(JSON.stringify(value)).length;
  if (byteLength > MAX_SETTINGS_VALUE_BYTES) {
    throw errors.CONFLICT({
      data: { reason: "settings_value_too_large", key: `${group}.${key}` },
    });
  }
}
