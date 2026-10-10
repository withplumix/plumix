import type { SQL } from "drizzle-orm";

import type { EntryViewer } from "../../../entries/visibility.js";
import type { EntryFieldScope } from "../../../plugin/fields/entry.js";
import type {
  EntryReferenceSummary,
  LookupAdapter,
  LookupResult,
} from "../../../plugin/lookup.js";
import { entryTag } from "../../../cdn/contract/tags.js";
import { and, eq, inArray, like, ne, or, sql } from "../../../db/index.js";
import { entries, ENTRY_STATUSES } from "../../../db/schema/entries.js";
import { isAuthoredEntryType } from "../../../entries/authored.js";
import {
  readableEntryRows,
  referenceableEntryRows,
} from "../../../entries/visibility.js";
import { buildEntryPermalinks } from "../../../route/permalink.js";
import { LookupScopeError } from "../lookup.errors.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const ENTRY_ROW_COLUMNS = {
  id: entries.id,
  type: entries.type,
  title: entries.title,
  status: entries.status,
  slug: entries.slug,
  parentId: entries.parentId,
} as const;

interface EntryLookupRow {
  readonly id: number;
  readonly type: string;
  readonly title: string;
  readonly status: string;
  readonly slug: string;
  readonly parentId: number | null;
}

// `satisfies` (not an annotation) keeps `hydrate`'s concrete
// `EntryReferenceSummary` return type visible to callers instead of
// widening it to the contract's `HydratedReference`.
export const entryLookupAdapter = {
  async list(ctx, options) {
    const { conditions, entryTypes } = scopeConditions(options.scope);
    // The scope is caller-supplied, so without this any signed-in principal
    // could name a type and read its drafts. `undefined` means every type was
    // dropped.
    const visibility = or(
      ...entryTypes.map((type) => visibleTypeRows(ctx, type)),
    );
    if (visibility === undefined) return [];
    conditions.push(visibility);
    let limit: number;
    if (options.ids !== undefined) {
      // Invalid ids drop silently and read as orphans. The limit follows the id
      // count, not `MAX_LIST_LIMIT`, because the meta pipeline batches ids
      // across fields and may exceed 100.
      const numericIds = options.ids
        .map((id) => parseEntryId(id))
        .filter((id): id is number => id !== null);
      if (numericIds.length === 0) return [];
      conditions.push(inArray(entries.id, numericIds));
      limit = numericIds.length;
    } else {
      const trimmedQuery = options.query?.trim();
      if (trimmedQuery) {
        conditions.push(like(entries.title, `%${trimmedQuery}%`));
      }
      limit = clampLimit(options.limit);
    }
    const rows = await ctx.db
      .select(ENTRY_ROW_COLUMNS)
      .from(entries)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(entries.title)
      .limit(limit);
    const hrefs = await buildEntryPermalinks(ctx, rows);
    return rows.map((row, i) => toLookupResult(row, hrefs[i] ?? null));
  },

  async hydrate(ctx, options) {
    const numericIds = options.ids
      .map((id) => parseEntryId(id))
      .filter((id): id is number => id !== null);
    if (numericIds.length === 0) return [];
    const { conditions, entryTypes } = scopeConditions(options.scope);
    // Hydration feeds public render and anonymous REST, so unpublished targets
    // stay invisible. ANDed onto the scope, because a field's `scope.status`
    // can only narrow what the reader may see.
    const visibility = or(
      ...entryTypes.map((type) => referenceableEntryRows(ctx, type)),
    );
    if (visibility !== undefined) conditions.push(visibility);
    conditions.push(inArray(entries.id, numericIds));
    const rows = await ctx.db
      .select(ENTRY_ROW_COLUMNS)
      .from(entries)
      .where(and(...conditions))
      .limit(numericIds.length);
    const urls = await buildEntryPermalinks(ctx, rows);
    return rows.map((row, i) => toEntrySummary(row, urls[i] ?? null));
  },

  // `e:<id>` already covers every change to this entry; the coarse `t:<type>`
  // tag would purge the page on any publish of that type.
  embeddedCacheTags(id) {
    const numericId = parseEntryId(id);
    return numericId === null ? [] : [entryTag(numericId)];
  },
} satisfies LookupAdapter<EntryFieldScope>;

function parseEntryId(id: string): number | null {
  // entries.id is autoincrement; reject anything that isn't a positive integer.
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isTypeNameList(
  value: unknown,
): value is readonly [string, ...string[]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((name) => typeof name === "string")
  );
}

interface ScopedEntryQuery {
  readonly conditions: SQL[];
  readonly entryTypes: readonly string[];
}

function scopeConditions(scope: EntryFieldScope | undefined): ScopedEntryQuery {
  // Checked at runtime because a wire caller could omit `entryTypes` and turn
  // the picker into an every-entry channel, or pass a bare string read one
  // character at a time.
  if (!scope?.entryTypes || !isTypeNameList(scope.entryTypes)) {
    throw LookupScopeError.entryTypesRequired();
  }
  const { entryTypes } = scope;
  // Revision and autosave rows live in `entries` beside content, so a
  // scope naming one would read as an ordinary type filter — and an
  // autosave holds another author's unsaved title.
  for (const type of entryTypes) {
    if (!isAuthoredEntryType(type))
      throw LookupScopeError.reservedEntryType(type);
  }
  // Redundant under the per-type visibility clause both surfaces add, but it
  // filters for any caller that adds none.
  const conditions: SQL[] = [inArray(entries.type, [...entryTypes])];
  if (scope.status !== undefined) {
    // Same wire-side reality as `entryTypes` above: the lookup RPC
    // forwards scope untyped, so a non-member value must fail as a
    // named scope error, not a driver-level bind failure.
    if (!ENTRY_STATUSES.includes(scope.status)) {
      throw LookupScopeError.invalidEntryStatus();
    }
    conditions.push(eq(entries.status, scope.status));
  } else if (!scope.includeTrashed) {
    conditions.push(ne(entries.status, "trash"));
  }
  return { conditions, entryTypes };
}

// Without `read`, public nav (no principal) still gets a public type's
// published rows. Arms must parenthesize themselves: drizzle leaves a lone
// `or` operand bare.
function visibleTypeRows(ctx: EntryViewer, type: string): SQL | undefined {
  const readable = readableEntryRows(ctx, type);
  if (readable !== null) return readable;
  if (!ctx.plugins.entryTypes.get(type)?.isPublic) return undefined;
  return sql`(${and(eq(entries.type, type), eq(entries.status, "published"))})`;
}

function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(requested), MAX_LIST_LIMIT);
}

function toLookupResult(
  row: EntryLookupRow,
  href: string | null,
): LookupResult {
  const trimmedTitle = row.title.trim();
  // `null` (not an English "Untitled <type>" string) so consumers
  // render their own localized fallback — menu items and reference
  // fields fall through to their own deletion-resilient chain.
  const label: string | null = trimmedTitle !== "" ? trimmedTitle : null;
  return {
    id: String(row.id),
    label,
    targetType: row.type,
    subtitle: `${row.type} · ${row.status}`,
    ...(href !== null ? { href } : {}),
  };
}

function toEntrySummary(
  row: EntryLookupRow,
  url: string | null,
): EntryReferenceSummary {
  const trimmedTitle = row.title.trim();
  return {
    id: String(row.id),
    type: row.type,
    // `null` mirrors `LookupResult.label` — consumers localize the fallback.
    title: trimmedTitle !== "" ? trimmedTitle : null,
    slug: row.slug,
    url,
  };
}
