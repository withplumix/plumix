// Server-side admin resolver. Takes raw `entries` rows from a menu and
// produces the `resolved` shape the admin renders — state (ok / broken /
// unauthorized), display label, current href, and the last-known href
// for "Convert to Custom URL" seeding.
//
// Distinct from `getMenuByName`'s render-side resolver: that one drops
// broken items silently for public output. This one keeps them so the
// editor can surface them with a warning + Re-link affordances.

import type { AppContext, LookupResult } from "plumix/plugin";

import type { ItemState } from "../admin/item-state.js";
import type { MenuItemMeta } from "./types.js";
import { mapItemState } from "../admin/item-state.js";
import { parseMenuItemMeta } from "./parseMeta.js";

export interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

export interface ResolvedRow extends MenuItemRow {
  readonly resolved: {
    readonly state: ItemState;
    readonly label: string;
    readonly href: string | null;
    readonly lastHref: string | null;
  };
}

export async function resolveItemStates(
  ctx: AppContext,
  rows: readonly MenuItemRow[],
): Promise<ResolvedRow[]> {
  if (rows.length === 0) return [];

  const parsed = rows.map((row) => ({
    row,
    meta: parseMenuItemMeta(row.meta),
  }));

  // Batch lookups by kind so a 50-item menu hits each adapter once.
  const idsByKind = new Map<string, Set<string>>();
  for (const { meta } of parsed) {
    if (!meta || meta.kind === "custom") continue;
    const id = meta.kind === "entry" ? meta.entryId : meta.termId;
    const set = idsByKind.get(meta.kind) ?? new Set<string>();
    set.add(String(id));
    idsByKind.set(meta.kind, set);
  }

  const eligibleEntryTypes = [...ctx.plugins.entryTypes.values()]
    .filter((t) => (t.isShownInMenus ?? t.isPublic ?? true) === true)
    .map((t) => t.name);
  const eligibleTaxonomies = [...ctx.plugins.termTaxonomies.values()]
    .filter((t) => (t.isShownInMenus ?? t.isPublic ?? true) === true)
    .map((t) => t.name);

  const canAccessKind = (kind: string): boolean => {
    const adapter = ctx.plugins.lookupAdapters.get(kind);
    if (!adapter) return false;
    return adapter.capability === null
      ? true
      : ctx.auth.can(adapter.capability);
  };

  // Resolve all kinds in parallel. Each kind is independent — no need
  // to serialize the round-trips.
  const lookupsByKind = new Map<string, Map<string, LookupResult>>();
  await Promise.all(
    [...idsByKind.entries()].map(async ([kind, ids]) => {
      const adapter = ctx.plugins.lookupAdapters.get(kind)?.adapter;
      // Skip the adapter call when:
      // 1. the adapter isn't registered at all,
      // 2. the viewer lacks the adapter's capability — fetching would
      //    leak labels into `resolved.label` for kinds they shouldn't
      //    see (information disclosure),
      // 3. the kind has no eligible types/taxonomies — no row could
      //    possibly resolve, and some adapters reject empty scopes.
      if (!adapter || !canAccessKind(kind)) {
        lookupsByKind.set(kind, new Map());
        return;
      }
      const built = buildScope(kind, eligibleEntryTypes, eligibleTaxonomies);
      if (built.empty) {
        lookupsByKind.set(kind, new Map());
        return;
      }
      const results = await adapter.list(ctx, {
        ids: [...ids],
        scope: built.scope,
      });
      const byId = new Map<string, LookupResult>();
      for (const result of results) byId.set(result.id, result);
      lookupsByKind.set(kind, byId);
    }),
  );

  return parsed.map(({ row, meta }) =>
    enrich(row, meta, lookupsByKind, canAccessKind),
  );
}

interface BuiltScope {
  readonly scope: unknown;
  readonly empty: boolean;
}

function buildScope(
  kind: string,
  entryTypes: readonly string[],
  termTaxonomies: readonly string[],
): BuiltScope {
  // Returns scope + emptiness flag tied to the specific kind. Generic
  // "any empty array" detection would over-skip if scope shapes ever
  // grow optional array fields.
  if (kind === "entry") {
    return { scope: { entryTypes }, empty: entryTypes.length === 0 };
  }
  if (kind === "term") {
    return {
      scope: { termTaxonomies },
      empty: termTaxonomies.length === 0,
    };
  }
  return { scope: undefined, empty: false };
}

function enrich(
  row: MenuItemRow,
  meta: MenuItemMeta | null,
  lookupsByKind: ReadonlyMap<string, ReadonlyMap<string, LookupResult>>,
  canAccessKind: (kind: string) => boolean,
): ResolvedRow {
  if (!meta) {
    // Garbage meta — treat as broken so the row still surfaces. The
    // user can Convert-to-Custom or Remove it.
    return {
      ...row,
      resolved: {
        state: "broken",
        label: row.title || "(unnamed)",
        href: null,
        lastHref: null,
      },
    };
  }

  if (meta.kind === "custom") {
    return {
      ...row,
      resolved: {
        state: "ok",
        label: row.title || "(unnamed)",
        href: meta.url,
        lastHref: null,
      },
    };
  }

  const id = String(meta.kind === "entry" ? meta.entryId : meta.termId);
  const lookupResult = lookupsByKind.get(meta.kind)?.get(id) ?? null;
  const state = mapItemState({ meta, lookupResult, canAccessKind });

  // Label preference: row.title (override) → resolver result → cached
  // snapshot in meta → "(unnamed)". Same shape for href, minus the
  // override (entries don't carry an href column).
  const cached = (lookupResult?.cached ?? {}) as {
    readonly label?: unknown;
    readonly href?: unknown;
  };
  const resolverLabel =
    typeof cached.label === "string" && cached.label.length > 0
      ? cached.label
      : (lookupResult?.label ?? null);
  const resolverHref =
    typeof cached.href === "string" && cached.href.length > 0
      ? cached.href
      : null;

  const label =
    (row.title.length > 0 ? row.title : null) ??
    resolverLabel ??
    meta.lastLabel ??
    "(unnamed)";

  return {
    ...row,
    resolved: {
      state,
      label,
      href: hrefFor(state, resolverHref, meta.lastHref ?? null),
      lastHref: meta.lastHref ?? null,
    },
  };
}

function hrefFor(
  state: ItemState,
  resolverHref: string | null,
  lastHref: string | null,
): string | null {
  // Per-state intent:
  // - ok:           current resolved href, falling back to last-known.
  // - broken:       last-known only — Convert-to-Custom seeds the editor.
  // - unauthorized: null. Defense in depth — even if lookup leaked
  //                 through, we don't surface a current href the
  //                 viewer wasn't supposed to see.
  if (state === "ok") return resolverHref ?? lastHref;
  if (state === "broken") return lastHref;
  return null;
}
