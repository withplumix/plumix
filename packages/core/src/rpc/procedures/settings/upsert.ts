import { sql } from "drizzle-orm";

import type { NewSetting } from "../../../db/schema/settings.js";
import { and, eq, inArray } from "../../../db/index.js";
import { settings } from "../../../db/schema/settings.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
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

    const deletes: string[] = [];
    const upsertRows: NewSetting[] = [];
    for (const [key, value] of Object.entries(filtered.values)) {
      if (value === null || value === undefined) {
        deletes.push(key);
        continue;
      }
      assertEncodedSize(filtered.group, key, value, errors);
      upsertRows.push({ group: filtered.group, key, value });
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
    const bag: Record<string, unknown> = {};
    for (const row of fresh) bag[row.key] = row.value;

    await context.hooks.doAction("settings:group_changed", {
      group: filtered.group,
      set: Object.fromEntries(upsertRows.map((r) => [r.key, r.value])),
      removed: deletes,
    });

    return context.hooks.applyFilter("rpc:settings.upsert:output", bag, {
      group: filtered.group,
    });
  });

// Guard against values that can't be persisted (un-serializable) or
// that blow past the per-value cap in `schemas.ts`. Both translate to a
// CONFLICT with a keyed `reason` so admin UIs surface which field hit
// the limit.
function assertEncodedSize(
  group: string,
  key: string,
  value: unknown,
  errors: {
    CONFLICT: (args: { data: { reason: string; key?: string } }) => Error;
  },
): void {
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) {
    throw errors.CONFLICT({
      data: { reason: "settings_invalid_value", key: `${group}.${key}` },
    });
  }
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_SETTINGS_VALUE_BYTES) {
    throw errors.CONFLICT({
      data: { reason: "settings_value_too_large", key: `${group}.${key}` },
    });
  }
}
