// Server-side admin resolver. Takes raw `entries` rows from a menu and
// produces the `resolved` shape the admin renders — state (ok / broken /
// unauthorized), display label, current href, and the last-known href
// for "Convert to Custom URL" seeding.
//
// Distinct from `getMenuByName`'s render-side resolver: that one drops
// broken items silently for public output. This one keeps them so the
// editor can surface them with a warning + Re-link affordances.

import type { JsonObject } from "plumix";
import type { AppContext, LookupResult } from "plumix/plugin";

import type { ItemState } from "../admin/item-state.js";
import type {
  MenuItemEntryMeta,
  MenuItemMeta,
  MenuItemTermMeta,
} from "./types.js";
import { mapItemState } from "../admin/item-state.js";
import { isMenuEligible } from "./eligibility.js";
import { itemOwnLabel } from "./label.js";
import { parseMenuItemMeta } from "./parseMeta.js";

/** A `menu_item` row as it comes out of the DB — `meta` still unparsed JSON. */
export interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: JsonObject;
}

/**
 * What the editor receives. `meta` is the parsed value this resolver already
 * computed — sending the raw column instead would make every client re-parse
 * it, and the one that didn't asserted its way to the same type without the
 * check. `null` when the stored JSON matched no known kind, which is also
 * what puts `resolved.state` at `"broken"`.
 */
export interface ResolvedRow extends Omit<MenuItemRow, "meta"> {
  readonly meta: MenuItemMeta | null;
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
  const targets = await lookupMenuTargets(
    ctx,
    parsed.map(({ meta }) => meta),
  );

  return parsed.map(({ row, meta }) => enrich(row, meta, targets));
}

/** The menu items' targets, looked up once per kind. */
export interface MenuTargetLookups {
  readonly canAccessKind: (kind: string) => boolean;
  /** `null` when the target didn't resolve for this viewer. */
  readonly resultFor: (
    meta: MenuItemEntryMeta | MenuItemTermMeta,
  ) => LookupResult | null;
}

/**
 * Looks up the targets of `metas`' entry and term items, restricted to
 * menu-eligible types and taxonomies and to the kinds the viewer may read.
 */
export async function lookupMenuTargets(
  ctx: AppContext,
  metas: readonly (MenuItemMeta | null)[],
): Promise<MenuTargetLookups> {
  // Batch lookups by kind so a 50-item menu hits each adapter once.
  const idsByKind = new Map<string, Set<string>>();
  for (const meta of metas) {
    if (!meta || meta.kind === "custom") continue;
    const set = idsByKind.get(meta.kind) ?? new Set<string>();
    set.add(targetId(meta));
    idsByKind.set(meta.kind, set);
  }

  const eligibleEntryTypes = [...ctx.plugins.entryTypes.values()]
    .filter(isMenuEligible)
    .map((t) => t.name);
  const eligibleTaxonomies = [...ctx.plugins.termTaxonomies.values()]
    .filter(isMenuEligible)
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

  return {
    canAccessKind,
    resultFor: (meta) =>
      lookupsByKind.get(meta.kind)?.get(targetId(meta)) ?? null,
  };
}

function targetId(meta: MenuItemEntryMeta | MenuItemTermMeta): string {
  return String(meta.kind === "entry" ? meta.entryId : meta.termId);
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
  targets: MenuTargetLookups,
): ResolvedRow {
  if (!meta) {
    // Garbage meta — treat as broken so the row still surfaces. The
    // user can Convert-to-Custom or Remove it.
    return {
      ...row,
      meta,
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
      meta,
      resolved: {
        state: "ok",
        label: row.title || "(unnamed)",
        href: meta.url,
        lastHref: null,
      },
    };
  }

  const lookupResult = targets.resultFor(meta);
  const state = mapItemState({
    meta,
    lookupResult,
    canAccessKind: targets.canAccessKind,
  });

  // Label preference: row.title (override) → resolver result →
  // last-known snapshot in meta → "(unnamed)". Same shape for href,
  // minus the override (entries don't carry an href column).
  const label =
    itemOwnLabel(row.title) ??
    lookupResult?.label ??
    meta.lastLabel ??
    "(unnamed)";

  return {
    ...row,
    meta,
    resolved: {
      state,
      label,
      href: hrefFor(state, lookupResult?.href ?? null, meta.lastHref ?? null),
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
