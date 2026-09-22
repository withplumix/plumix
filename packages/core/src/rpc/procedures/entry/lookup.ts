import type { SQL } from "drizzle-orm";

import type { EntryViewer } from "../../../entries/visibility.js";
import type { EntryFieldScope } from "../../../plugin/fields/entry.js";
import type {
  EntryReferenceSummary,
  LookupAdapter,
  LookupResult,
} from "../../../plugin/lookup.js";
import { entryTag } from "../../../cdn/tags.js";
import { and, eq, inArray, like, ne, or, sql } from "../../../db/index.js";
import { entries, ENTRY_STATUSES } from "../../../db/schema/entries.js";
import { entryCapabilityByName } from "../../../entries/capabilities.js";
import { readableEntryRows } from "../../../entries/visibility.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
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
    // The scope arrives from the caller, so without this it is the only
    // filter there is and any signed-in principal could name a type and
    // read back its drafts. `undefined` means every type was dropped.
    const visibility = or(
      ...entryTypes.map((type) => visibleTypeRows(ctx, type)),
    );
    if (visibility === undefined) return [];
    conditions.push(visibility);
    let limit: number;
    if (options.ids !== undefined) {
      // Resolve-by-id batch path: ignore `query`, return only the
      // requested ids (still subject to scope). Invalid ids are
      // silently dropped — they read as orphans on the caller's side.
      // Limit tracks `numericIds.length` (not `MAX_LIST_LIMIT`) since
      // the meta pipeline aggregates ids across same-`(kind,scope)`
      // fields and may legitimately request >100 in one call.
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
    // Viewer-visibility clamp: hydration feeds public render and
    // anonymous REST, where an unpublished referenced entry must stay
    // invisible (pre-hydration reads exposed only an opaque id). The
    // picker-shaped default of `scopeConditions` (drafts admitted)
    // only survives for viewers who could see the draft in the admin
    // anyway — per referenced type, gated on `edit_any`. An explicit
    // `scope.status` is the field author's call and passes through.
    if (options.scope?.status === undefined) {
      const visibleUnpublished = entryTypes.filter((type) =>
        ctx.auth.can(entryCapabilityByName(ctx.plugins, type, "edit_any")),
      );
      if (visibleUnpublished.length < entryTypes.length) {
        const published = eq(entries.status, "published");
        conditions.push(
          visibleUnpublished.length === 0
            ? published
            : (or(published, inArray(entries.type, visibleUnpublished)) ??
                published),
        );
      }
    }
    conditions.push(inArray(entries.id, numericIds));
    const rows = await ctx.db
      .select(ENTRY_ROW_COLUMNS)
      .from(entries)
      .where(and(...conditions))
      .limit(numericIds.length);
    const urls = await buildEntryPermalinks(ctx, rows);
    return rows.map((row, i) => toEntrySummary(row, urls[i] ?? null));
  },

  // A page embedding entry B carries B's precise entry tag, so B's
  // lifecycle (`entryPurgeTags` enqueues `e:<id>` on publish/edit/
  // meta-change/trash/restore/delete) purges the embedding page. The
  // coarse `t:<type>` tag is deliberately omitted — it would purge the
  // page on any publish of that type, and `e:<id>` alone already covers
  // every change to this specific entry.
  embeddedCacheTags(payload) {
    const numericId = parseEntryId(payload.id);
    return numericId === null ? [] : [entryTag(numericId)];
  },
} satisfies LookupAdapter<EntryFieldScope>;

function parseEntryId(id: string): number | null {
  // entries.id is autoincrement; reject anything that isn't a positive integer.
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Non-empty, and every member a string — `scope` arrives off the wire. */
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
  // Required at runtime, not just at the builder's TS level: a wire-side
  // caller (lookup RPC, plugin-registered legacy field) could otherwise
  // omit `entryTypes` and silently disable the type filter — which would
  // turn the picker into a "list every entry across every type" channel.
  // The element check is the same wire-side reality: a bare string is
  // truthy and carries a `length`, and would otherwise be read one
  // character at a time.
  if (!scope?.entryTypes || !isTypeNameList(scope.entryTypes)) {
    throw LookupScopeError.entryTypesRequired();
  }
  const { entryTypes } = scope;
  // Revision and autosave rows live in `entries` beside content, so a
  // scope naming one would read as an ordinary type filter — and an
  // autosave holds another author's unsaved title.
  for (const type of entryTypes) {
    if (isReservedType(type)) throw LookupScopeError.reservedEntryType(type);
  }
  // `list` ANDs a per-type visibility clause over this, which implies the
  // `in` list; `hydrate` clamps by status alone, so this is what scopes it
  // to the requested types.
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

/**
 * The rows of one entry type `list` may hand this viewer, or `undefined` when
 * it may hand them none — `or` drops that disjunct rather than widening past
 * it. A viewer holding `entry:<type>:read` gets the admin answer —
 * `readableEntryRows`, which admits the unpublished rows they may edit. A
 * viewer without it gets the published rows of a public type: public nav
 * resolves through this adapter with no principal at all and would otherwise
 * go empty. An `access` policy on the type is not consulted — it resolves per
 * entry and may do I/O, so it is no WHERE clause.
 *
 * Both arms parenthesize themselves, and must: drizzle leaves a lone `or`
 * operand bare, and the result is `AND`ed onto the scope conditions.
 */
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
