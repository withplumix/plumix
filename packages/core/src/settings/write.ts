import type {
  AppContext,
  SettingsGroupCopy,
  SettingsPatch,
  SettingsWriteGuard,
} from "../context/app-context.js";
import type { JsonValue } from "../json.js";
import type { MetaFieldError } from "../meta/field-pipeline.js";
import { assertWritable } from "../db/edit-lease.js";
import { eq } from "../db/index.js";
import { settings } from "../db/schema/settings.js";
import { decodeJsonValue } from "../meta/coerce.js";
import { runFieldPipeline } from "../meta/field-pipeline.js";
import { isConditionHidden } from "../plugin/fields/condition.js";
import { startingMeta } from "../plugin/fields/starting-meta.js";
import {
  SETTINGS_CREATED_KEY,
  settingsGroupBag,
} from "../template-deps-core.js";
import { SettingsWriteError } from "./errors.js";
import {
  bumpSettingsGroup,
  claimSettingsGroup,
  settingsGroupEtag,
  settingsGroupResource,
  writeSettingsKeys,
} from "./token.js";

/** 64 KiB per value matches the WP `wp_options` convention. */
const MAX_SETTINGS_VALUE_BYTES = 64 * 1024;

/**
 * `ctx.settings.write`, and what `settings.upsert` writes through. Keys mapped
 * to `null` or `undefined` are deletions; anything else is an upsert.
 * Unmentioned keys are left alone — same partial-patch semantic as
 * `entry.meta`.
 */
export async function writeSettingsGroup(
  ctx: AppContext,
  groupName: string,
  input: SettingsPatch,
  guard?: SettingsWriteGuard,
): Promise<SettingsGroupCopy> {
  // Registered fields go through the meta write pipeline. Condition-hidden
  // fields are dropped first: a value the editor cannot see must not persist.
  const group = ctx.plugins.settingsGroups.get(groupName);
  const groupFields = new Map((group?.fields ?? []).map((f) => [f.key, f]));

  // A group counts as created on its first save, which writes every field and
  // a marker row, so from then on a cleared setting stays absent.
  let values = input;
  if (group) {
    const storedKeys = new Set(
      (
        await ctx.db
          .select({ key: settings.key })
          .from(settings)
          .where(eq(settings.group, groupName))
      ).map((row) => row.key),
    );
    if (!storedKeys.has(SETTINGS_CREATED_KEY)) {
      const starting = Object.entries(startingMeta(group.fields)).filter(
        ([key]) => !storedKeys.has(key),
      );
      values = { ...Object.fromEntries(starting), ...input };
    }
  }

  const deletes: string[] = [];
  // Not `NewSetting`: the insert type leaves `value` optional and
  // nullable, and `settings:group_changed` ships these rows as a
  // `SettingsBag`, which admits neither.
  const upsertRows: { group: string; key: string; value: JsonValue }[] = [];
  const fieldErrors: MetaFieldError[] = [];
  for (const [key, value] of Object.entries(values)) {
    // Reserved: only the claim writes it.
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
        throw SettingsWriteError.invalidValue(`${groupName}.${key}`);
      }
    }
    // A `.sanitize()` callback returning nothing leaves nothing to write.
    if (stored === undefined) continue;
    upsertRows.push({ group: groupName, key, value: stored });
  }
  // Runs before the size check so a validation failure is never masked by an
  // oversized sibling.
  const [firstError] = fieldErrors;
  if (firstError) {
    throw SettingsWriteError.invalidValue(
      `${groupName}.${firstError.path.split(".")[0] ?? firstError.path}`,
      fieldErrors,
    );
  }
  for (const row of upsertRows) {
    const byteLength = new TextEncoder().encode(
      JSON.stringify(row.value),
    ).length;
    if (byteLength > MAX_SETTINGS_VALUE_BYTES) {
      throw SettingsWriteError.valueTooLarge(`${row.group}.${row.key}`);
    }
  }

  const changed = upsertRows.length > 0 || deletes.length > 0;
  if (guard) {
    await assertWritable(
      ctx.db,
      settingsGroupResource(groupName),
      guard.writer,
      {
        takeOver: guard.takeOver,
      },
    );
    await claimSettingsGroup(ctx.db, groupName, guard.ifMatch);
  } else if (changed) {
    await bumpSettingsGroup(ctx.db, groupName);
  }
  await writeSettingsKeys(ctx.db, groupName, upsertRows, deletes);

  // Re-read the authoritative bag, so the caller gets the final shape.
  const fresh = await ctx.db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.group, groupName));
  // `null` is a value the column can hold, so it stays in the bag.
  const copy = {
    etag: settingsGroupEtag(fresh),
    values: settingsGroupBag(fresh, group?.fields ?? []),
  };

  // Fire only when the call actually changed state — an empty
  // `values: {}` payload is a no-op and shouldn't wake up
  // cache-invalidators / audit-log subscribers.
  if (changed) {
    await ctx.hooks.doAction(
      "settings:group_changed",
      {
        group: groupName,
        set: Object.fromEntries(upsertRows.map((r) => [r.key, r.value])),
        removed: deletes,
      },
      ctx,
    );
  }
  return copy;
}
