import type { AppContext } from "../../../context/app.js";
import type { JsonObject, JsonValue } from "../../../json.js";
import type { SettledMeta } from "../../meta/core.js";
import { and, asc, eq, gt, notInArray, or, sql } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { settings } from "../../../db/schema/settings.js";
import { terms } from "../../../db/schema/terms.js";
import { users } from "../../../db/schema/users.js";
import {
  listEntryMetaFields,
  listTermMetaFields,
  listUserMetaFields,
} from "../../../plugin/manifest.js";
import { RESERVED_TYPES } from "../../../revisions/slug-codec.js";
import {
  metaScope,
  metaScopeCache,
  settleStoredMeta,
} from "../../meta/core.js";
import { writeSettledEntryMeta } from "../entry/meta.js";
import { writeSettledTermMeta } from "../term/meta.js";
import { writeSettledUserMeta } from "../user/meta.js";

/** Where a meta value is stored, in the order a sweep walks them. */
export const META_STORES = ["entry", "term", "user", "settings"] as const;
export type MetaStore = (typeof META_STORES)[number];

/**
 * One field key's unsettled values within one scope of a store — see
 * **unsettled value** in `CONTEXT.md`.
 */
export interface UnsettledKeyCount {
  readonly store: MetaStore;
  /**
   * The entry type, taxonomy or settings group the field is declared for.
   * `null` for users, whose meta has one flat keyspace.
   */
  readonly scope: string | null;
  readonly key: string;
  /** Rows holding a value the write path would store in another form. */
  readonly settleable: number;
  /** Rows holding a value no declared type accepts — reported, never touched. */
  readonly unconvertible: number;
  /**
   * Ids of the rows behind `unconvertible`, up to {@link MAX_UNCONVERTIBLE_IDS}
   * — enough for a human to find and fix them. Settings rows have no id, so
   * their key alone says where to look.
   */
  readonly unconvertibleIds: readonly number[];
}

/** Where a sweep stopped. Handed back as `cursor` to carry on from there. */
export interface MetaSweepCursor {
  readonly store: MetaStore;
  /** For entries, terms and users: the id of the last row walked. */
  readonly after: number;
  /**
   * For settings, which have no id: the last row walked, by its key. A key
   * rather than a position, so a row removed between two calls can't shift the
   * walk past one it never reached.
   */
  readonly setting?: { readonly group: string; readonly key: string };
}

export interface MetaSweep {
  readonly keys: readonly UnsettledKeyCount[];
  /** Rows written back. Zero when reporting. */
  readonly settled: number;
  /** Where to carry on from, or `null` once every store has been walked. */
  readonly next: MetaSweepCursor | null;
}

// D1 caps the queries one Worker invocation may make — 50 on the free plan —
// and every settled row costs a write plus whatever its announcement's hooks
// do. Half the cap leaves room for those, so a call on the admin's settle
// button never dies partway; the caller loops on `next` instead.
const QUERY_BUDGET = 25;

// Rows per read: reporting a large site takes a read per page, and holding a
// whole store in memory at once is what the paging avoids.
const PAGE = 500;

export const MAX_UNCONVERTIBLE_IDS = 20;

/**
 * Find — and, with `write`, settle — unsettled meta values across the site:
 * entry, term and user meta, and settings.
 *
 * A call spends at most {@link QUERY_BUDGET} queries and hands back `next` when
 * it stops short; pass it as `cursor` to carry on. Counts are for the rows this
 * call walked, so a caller walking the whole site adds them up.
 *
 * Settling writes and announces through the same step the admin's read heal
 * uses, so a row the sweep writes is exactly what opening it would have
 * written, and the announcement is what purges its render from the CDN. A
 * value no declared type accepts is counted and left as stored; a key no
 * registered field owns is neither counted nor touched.
 *
 * Autosave and revision rows are skipped. An autosave is the author's edits,
 * run through the field pipeline when publish promotes them; a revision is a
 * record of what the row held, not live content.
 */
export async function sweepUnsettledMeta(
  ctx: AppContext,
  options: {
    readonly write: boolean;
    readonly cursor?: MetaSweepCursor | null;
  },
): Promise<MetaSweep> {
  const walk = new Walk(ctx, options.write);
  let from = options.cursor ?? null;
  const first = from === null ? 0 : META_STORES.indexOf(from.store);
  for (const store of META_STORES.slice(first)) {
    const stopped = await STORES[store](walk, from);
    if (stopped !== null) return walk.result(stopped);
    from = null;
  }
  return walk.result(null);
}

/**
 * Run the sweep from the start until it reports done, adding up what each call
 * found — for a caller with no per-invocation cap to stay under, such as the
 * command line.
 */
export async function sweepAllUnsettledMeta(
  ctx: AppContext,
  options: { readonly write: boolean },
): Promise<Omit<MetaSweep, "next">> {
  let keys: readonly UnsettledKeyCount[] = [];
  let settled = 0;
  let cursor: MetaSweepCursor | null = null;
  do {
    const call = await sweepUnsettledMeta(ctx, {
      write: options.write,
      cursor,
    });
    keys = mergeUnsettledKeys(keys, call.keys);
    settled += call.settled;
    cursor = call.next;
  } while (cursor !== null);
  return { keys, settled };
}

/** Add up two calls' counts, key by key. */
export function mergeUnsettledKeys(
  a: readonly UnsettledKeyCount[],
  b: readonly UnsettledKeyCount[],
): readonly UnsettledKeyCount[] {
  const tally = new Tally();
  for (const count of [...a, ...b]) tally.merge(count);
  return tally.counts();
}

// Each store walks on from `from` — from its first row when `null` — and
// answers where it stopped short, or `null` once it has walked every row.
type StoreWalk = (
  walk: Walk,
  from: MetaSweepCursor | null,
) => Promise<MetaSweepCursor | null>;

const STORES: Readonly<Record<MetaStore, StoreWalk>> = {
  entry: (walk, from) => {
    const scope = metaScopeCache((type) =>
      listEntryMetaFields(walk.ctx.plugins, type),
    );
    return walk.pages(
      "entry",
      from,
      (after) =>
        walk.ctx.db
          .select({ id: entries.id, type: entries.type, meta: entries.meta })
          .from(entries)
          .where(
            and(
              gt(entries.id, after),
              notInArray(entries.type, [...RESERVED_TYPES]),
            ),
          )
          .orderBy(asc(entries.id))
          .limit(PAGE),
      (row) => ({
        scope: row.type,
        settled: settleStoredMeta(scope(row.type), row.meta),
        write: (patch) => writeSettledEntryMeta(walk.ctx, row, row.meta, patch),
      }),
    );
  },
  term: (walk, from) => {
    const scope = metaScopeCache((taxonomy) =>
      listTermMetaFields(walk.ctx.plugins, taxonomy),
    );
    return walk.pages(
      "term",
      from,
      (after) =>
        walk.ctx.db
          .select({ id: terms.id, taxonomy: terms.taxonomy, meta: terms.meta })
          .from(terms)
          .where(gt(terms.id, after))
          .orderBy(asc(terms.id))
          .limit(PAGE),
      (row) => ({
        scope: row.taxonomy,
        settled: settleStoredMeta(scope(row.taxonomy), row.meta),
        write: (patch) => writeSettledTermMeta(walk.ctx, row, row.meta, patch),
      }),
    );
  },
  user: (walk, from) => {
    const scope = metaScope(listUserMetaFields(walk.ctx.plugins));
    return walk.pages(
      "user",
      from,
      (after) =>
        walk.ctx.db
          .select({ id: users.id, meta: users.meta })
          .from(users)
          .where(gt(users.id, after))
          .orderBy(asc(users.id))
          .limit(PAGE),
      (row) => ({
        scope: null,
        settled: settleStoredMeta(scope, row.meta),
        write: (patch) => writeSettledUserMeta(walk.ctx, row, row.meta, patch),
      }),
    );
  },
  settings: sweepSettings,
};

// Settings are one row per key rather than a bag per row, and a site holds a
// handful of groups, so what is left of them is read in one query. Each settled
// group is announced once, as a settings save would.
async function sweepSettings(
  walk: Walk,
  from: MetaSweepCursor | null,
): Promise<MetaSweepCursor | null> {
  if (!walk.spend()) return from ?? { store: "settings", after: 0 };
  const last = from?.setting;
  const rows = await walk.ctx.db
    .select()
    .from(settings)
    .where(
      last === undefined
        ? undefined
        : or(
            gt(settings.group, last.group),
            and(eq(settings.group, last.group), gt(settings.key, last.key)),
          ),
    )
    .orderBy(asc(settings.group), asc(settings.key));
  const groups = walk.ctx.plugins.settingsGroups;
  const scopeOf = metaScopeCache((name) => groups.get(name)?.fields ?? []);
  const changedByGroup = new Map<string, Record<string, JsonValue>>();
  let stopped: MetaSweepCursor | null = null;
  let walked = last;
  for (const row of rows) {
    if (groups.has(row.group)) {
      const stored = row.value ?? null;
      const settled = settleStoredMeta(scopeOf(row.group), {
        [row.key]: stored,
      });
      const next = settled.patch.upserts.get(row.key);
      if (walk.write && next !== undefined && !walk.spend()) {
        stopped = {
          store: "settings",
          after: 0,
          ...(walked === undefined ? {} : { setting: walked }),
        };
        break;
      }
      const written =
        walk.write &&
        next !== undefined &&
        (await writeSetting(walk.ctx, row, stored, next));
      if (written) {
        const changed = changedByGroup.get(row.group) ?? {};
        changed[row.key] = next;
        changedByGroup.set(row.group, changed);
      }
      walk.tally.add("settings", row.group, null, settled, written);
    }
    walked = { group: row.group, key: row.key };
  }
  for (const [group, set] of changedByGroup) {
    await walk.ctx.hooks.doAction(
      "settings:group_changed",
      { group, set, removed: [] },
      walk.ctx,
    );
  }
  return stopped;
}

// Guarded like the entry write-back: a save that landed since the read wins,
// and this key is left for the next sweep.
async function writeSetting(
  ctx: AppContext,
  row: { readonly group: string; readonly key: string },
  stored: JsonValue,
  next: JsonValue,
): Promise<boolean> {
  const landed = await ctx.db
    .update(settings)
    .set({ value: next })
    .where(
      and(
        eq(settings.group, row.group),
        eq(settings.key, row.key),
        sql`json(${settings.value}) IS json(${JSON.stringify(stored)})`,
      ),
    )
    .returning({ key: settings.key });
  return landed.length > 0;
}

interface SweptRow {
  readonly scope: string | null;
  readonly settled: SettledMeta;
  readonly write: (patch: SettledMeta["patch"]) => Promise<boolean>;
}

/** One call's walk: its budget, what it has counted, and how it writes. */
class Walk {
  readonly tally = new Tally();
  #queriesLeft = QUERY_BUDGET;

  constructor(
    readonly ctx: AppContext,
    readonly write: boolean,
  ) {}

  /** Take one query from the budget; `false` when there is none left. */
  spend(): boolean {
    if (this.#queriesLeft === 0) return false;
    this.#queriesLeft -= 1;
    return true;
  }

  /**
   * Walk a store by id, a page at a time, stopping short when the budget runs
   * out. Stopping before a row leaves `after` on the one before it, so the next
   * call starts at the row this one never reached.
   */
  async pages<Row extends { readonly id: number; readonly meta: JsonObject }>(
    store: MetaStore,
    from: MetaSweepCursor | null,
    readPage: (after: number) => Promise<readonly Row[]>,
    sweep: (row: Row) => SweptRow,
  ): Promise<MetaSweepCursor | null> {
    let after = from?.after ?? 0;
    for (;;) {
      if (!this.spend()) return { store, after };
      const page = await readPage(after);
      for (const row of page) {
        const swept = sweep(row);
        const writes = this.write && swept.settled.patch.upserts.size > 0;
        if (writes && !this.spend()) return { store, after };
        const written = writes && (await swept.write(swept.settled.patch));
        this.tally.add(store, swept.scope, row.id, swept.settled, written);
        after = row.id;
      }
      if (page.length < PAGE) return null;
    }
  }

  result(next: MetaSweepCursor | null): MetaSweep {
    return { keys: this.tally.counts(), settled: this.tally.settled, next };
  }
}

class Tally {
  readonly #byKey = new Map<string, UnsettledKeyCount>();
  settled = 0;

  add(
    store: MetaStore,
    scope: string | null,
    id: number | null,
    result: SettledMeta,
    written: boolean,
  ): void {
    if (written) this.settled += 1;
    for (const key of result.patch.upserts.keys()) {
      this.#bump(store, scope, key, (count) => ({
        ...count,
        settleable: count.settleable + 1,
      }));
    }
    for (const key of result.unconvertible) {
      this.#bump(store, scope, key, (count) => ({
        ...count,
        unconvertible: count.unconvertible + 1,
        unconvertibleIds:
          id === null || count.unconvertibleIds.length >= MAX_UNCONVERTIBLE_IDS
            ? count.unconvertibleIds
            : [...count.unconvertibleIds, id],
      }));
    }
  }

  merge(count: UnsettledKeyCount): void {
    this.#bump(count.store, count.scope, count.key, (current) => ({
      ...current,
      settleable: current.settleable + count.settleable,
      unconvertible: current.unconvertible + count.unconvertible,
      unconvertibleIds: [
        ...current.unconvertibleIds,
        ...count.unconvertibleIds,
      ].slice(0, MAX_UNCONVERTIBLE_IDS),
    }));
  }

  #bump(
    store: MetaStore,
    scope: string | null,
    key: string,
    next: (count: UnsettledKeyCount) => UnsettledKeyCount,
  ): void {
    const id = JSON.stringify([store, scope, key]);
    this.#byKey.set(
      id,
      next(
        this.#byKey.get(id) ?? {
          store,
          scope,
          key,
          settleable: 0,
          unconvertible: 0,
          unconvertibleIds: [],
        },
      ),
    );
  }

  counts(): readonly UnsettledKeyCount[] {
    return [...this.#byKey.values()].sort(
      (a, b) =>
        META_STORES.indexOf(a.store) - META_STORES.indexOf(b.store) ||
        (a.scope ?? "").localeCompare(b.scope ?? "") ||
        a.key.localeCompare(b.key),
    );
  }
}
