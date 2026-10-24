import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "../context/app-context.js";
import type { JsonValue } from "../json.js";
import type { SettingsRow } from "../template-deps-core.js";
import { ConflictError } from "../db/concurrency.js";
import {
  and,
  chunkForD1,
  D1_MAX_BOUND_PARAMETERS,
  eq,
  inArray,
} from "../db/index.js";
import { settings } from "../db/schema/settings.js";
import { SETTINGS_CREATED_KEY } from "../template-deps-core.js";

/**
 * The group's token is the counter its marker row holds. No marker, or one
 * still holding `true`, is token zero.
 */
function markerVersion(value: JsonValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

export function settingsGroupEtag(rows: readonly SettingsRow[]): string {
  const marker = rows.find((row) => row.key === SETTINGS_CREATED_KEY);
  return String(markerVersion(marker?.value));
}

/** Edit leases on a settings group are keyed under this kind. */
export function settingsGroupResource(group: string): {
  readonly kind: "settings_group";
  readonly id: string;
} {
  return { kind: "settings_group", id: group };
}

function isMarkerOf(group: string) {
  return and(eq(settings.group, group), eq(settings.key, SETTINGS_CREATED_KEY));
}

/** Moves the marker from `from` to `to`; `false` when it no longer holds `from`. */
async function moveMarker(
  db: Db,
  group: string,
  from: JsonValue,
  to: number,
): Promise<boolean> {
  const moved = await db
    .update(settings)
    .set({ value: to })
    .where(and(isMarkerOf(group), eq(settings.value, from)))
    .returning({ key: settings.key });
  return moved.length > 0;
}

async function readMarker(
  db: Db,
  group: string,
): Promise<JsonValue | undefined> {
  const [marker] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(isMarkerOf(group));
  return marker?.value ?? undefined;
}

/**
 * Moves the group's token past `ifMatch` and answers the new one. Throws
 * `ConflictError` when the group moved past that copy; a second first save
 * loses.
 */
export async function claimSettingsGroup(
  db: Db,
  group: string,
  ifMatch: number,
): Promise<number> {
  const next = ifMatch + 1;
  if (ifMatch > 0) {
    if (await moveMarker(db, group, ifMatch, next)) return next;
  } else {
    // A group saved before markers counted holds `true`, token zero too.
    if (await moveMarker(db, group, true, next)) return next;
    const inserted = await db
      .insert(settings)
      .values({ group, key: SETTINGS_CREATED_KEY, value: next })
      .onConflictDoNothing()
      .returning({ key: settings.key });
    if (inserted.length > 0) return next;
  }
  throw new ConflictError(
    markerVersion(await readMarker(db, group)),
    settingsGroupResource(group),
  );
}

/**
 * A system write's: moves a saved group's token without checking it, so a
 * copy taken before the write conflicts. A group never saved has no token.
 */
export async function bumpSettingsGroup(db: Db, group: string): Promise<void> {
  for (;;) {
    const current = await readMarker(db, group);
    if (current === undefined) return;
    if (await moveMarker(db, group, current, markerVersion(current) + 1)) {
      return;
    }
  }
}

type Batchable = Db & {
  batch(
    items: readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  ): Promise<readonly object[]>;
};

/** D1 and libSQL send a batch in one round trip; the sync drivers have none. */
function canBatch(db: Db): db is Batchable {
  return "batch" in db && typeof db.batch === "function";
}

/** One row per statement and the deletes chunked, under D1's parameter cap. */
export async function writeSettingsKeys(
  db: Db,
  group: string,
  upserts: readonly { readonly key: string; readonly value: JsonValue }[],
  deletes: readonly string[],
): Promise<void> {
  const statements = [
    ...chunkForD1(deletes, D1_MAX_BOUND_PARAMETERS - 1).map((keys) =>
      db
        .delete(settings)
        .where(and(eq(settings.group, group), inArray(settings.key, keys))),
    ),
    ...upserts.map(({ key, value }) =>
      db
        .insert(settings)
        .values({ group, key, value })
        .onConflictDoUpdate({
          target: [settings.group, settings.key],
          set: { value },
        }),
    ),
  ];
  const [first, ...rest] = statements;
  if (!first) return;
  if (canBatch(db)) {
    await db.batch([first, ...rest]);
    return;
  }
  for (const statement of statements) await statement;
}

/** Inserts each row whose key the group lacks; answers the keys it inserted. */
export async function insertAbsentSettingsKeys(
  db: Db,
  group: string,
  rows: readonly { readonly key: string; readonly value: JsonValue }[],
): Promise<string[]> {
  const inserted: string[] = [];
  for (const { key, value } of rows) {
    const landed = await db
      .insert(settings)
      .values({ group, key, value })
      .onConflictDoNothing()
      .returning({ key: settings.key });
    if (landed.length > 0) inserted.push(key);
  }
  return inserted;
}
