import { and, eq, inArray } from "drizzle-orm";

import type { AppContext, LookupResult } from "@plumix/core";
import { entries, entryTerm, isCurrentSource, terms } from "@plumix/core";

import type { TreeNode } from "./buildTree.js";
import type { MenuItemMeta, ResolvedMenu, ResolvedMenuItem } from "./types.js";
import { buildTree } from "./buildTree.js";
import { parseMenuItemMeta } from "./parseMeta.js";
import { sanitizeMenuHref } from "./url.js";

interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

interface ResolvedRef {
  readonly label: string;
  readonly href: string;
}

/**
 * `name` is matched against `terms.slug` (NOT `terms.name`) — the parameter
 * name mirrors WordPress's `wp_get_nav_menu_object()`.
 *
 * Resolution at render time is live: entry/term refs go through the
 * registered `LookupAdapter` per kind, batched by id, so a renamed page or
 * retitled category propagates without re-saving the menu. Items whose
 * ref fails to resolve (deleted, unpublished, scope-excluded) drop
 * silently along with their descendants — mirrors how broken refs will
 * be surfaced in admin from slice 11.
 */
export async function getMenuByName(
  ctx: AppContext,
  name: string,
): Promise<ResolvedMenu | null> {
  const [term] = await ctx.db
    .select({ id: terms.id, name: terms.name, slug: terms.slug })
    .from(terms)
    .where(and(eq(terms.taxonomy, "menu"), eq(terms.slug, name)))
    .limit(1);
  if (!term) return null;

  const rows: readonly MenuItemRow[] = await ctx.db
    .select({
      id: entries.id,
      parentId: entries.parentId,
      sortOrder: entries.sortOrder,
      title: entries.title,
      meta: entries.meta,
    })
    .from(entries)
    .where(
      and(
        eq(entries.type, "menu_item"),
        // Trashed/draft menu items must not surface in public nav. Only
        // `published` is a real lifecycle state for menu items today; if
        // the admin (slice 7+) introduces a drafting flow, revisit.
        eq(entries.status, "published"),
        inArray(
          entries.id,
          ctx.db
            .select({ id: entryTerm.entryId })
            .from(entryTerm)
            .where(eq(entryTerm.termId, term.id)),
        ),
      ),
    )
    .orderBy(entries.parentId, entries.sortOrder, entries.id);

  const refs = await resolveRefs(ctx, rows);
  const { tree } = buildTree(rows);
  const items = tree
    .map((node) => toResolvedItem(ctx, node, refs))
    .filter((item): item is ResolvedMenuItem => item !== null);

  return { termId: term.id, name: term.name, slug: term.slug, items };
}

interface ResolvedRefs {
  readonly entries: ReadonlyMap<number, ResolvedRef>;
  readonly terms: ReadonlyMap<number, ResolvedRef>;
}

async function resolveRefs(
  ctx: AppContext,
  rows: readonly MenuItemRow[],
): Promise<ResolvedRefs> {
  const entryIds = new Set<number>();
  const termIds = new Set<number>();
  for (const row of rows) {
    const meta = parseMenuItemMeta(row.meta);
    if (meta?.kind === "entry") entryIds.add(meta.entryId);
    else if (meta?.kind === "term") termIds.add(meta.termId);
  }

  const [entryRefs, termRefs] = await Promise.all([
    entryIds.size === 0 ? new Map() : resolveEntryRefs(ctx, entryIds),
    termIds.size === 0 ? new Map() : resolveTermRefs(ctx, termIds),
  ]);
  return { entries: entryRefs, terms: termRefs };
}

async function resolveEntryRefs(
  ctx: AppContext,
  ids: ReadonlySet<number>,
): Promise<Map<number, ResolvedRef>> {
  const adapter = ctx.plugins.lookupAdapters.get("entry")?.adapter;
  if (!adapter) return new Map();

  const eligibleTypes = [...ctx.plugins.entryTypes.values()]
    .filter((t) => t.isPublic === true)
    .map((t) => t.name);
  if (eligibleTypes.length === 0) return new Map();

  // The entry adapter excludes trash by default but admits drafts and
  // scheduled — fine for the picker (editors want to link to drafts), wrong
  // for public nav. Pre-filter to published ids so a draft that was added
  // to a menu doesn't render until it ships.
  const publishedIds = await ctx.db
    .select({ id: entries.id })
    .from(entries)
    .where(and(inArray(entries.id, [...ids]), eq(entries.status, "published")));
  if (publishedIds.length === 0) return new Map();

  const results = await adapter.list(ctx, {
    scope: { entryTypes: eligibleTypes },
    ids: publishedIds.map((r) => String(r.id)),
  });
  return refMapFromResults(results);
}

async function resolveTermRefs(
  ctx: AppContext,
  ids: ReadonlySet<number>,
): Promise<Map<number, ResolvedRef>> {
  const adapter = ctx.plugins.lookupAdapters.get("term")?.adapter;
  if (!adapter) return new Map();

  const eligibleTaxonomies = [...ctx.plugins.termTaxonomies.values()]
    .filter((t) => t.isPublic === true)
    .map((t) => t.name);
  if (eligibleTaxonomies.length === 0) return new Map();

  const results = await adapter.list(ctx, {
    scope: { termTaxonomies: eligibleTaxonomies },
    ids: [...ids].map(String),
  });
  return refMapFromResults(results);
}

function refMapFromResults(
  results: readonly LookupResult[],
): Map<number, ResolvedRef> {
  const map = new Map<number, ResolvedRef>();
  for (const result of results) {
    const numericId = Number(result.id);
    if (!Number.isFinite(numericId)) continue;
    const cached = (result.cached ?? {}) as {
      readonly label?: unknown;
      readonly href?: unknown;
    };
    const href = typeof cached.href === "string" ? cached.href : null;
    if (!href) continue; // No public URL → can't render in nav
    const label =
      typeof cached.label === "string" && cached.label.length > 0
        ? cached.label
        : result.label;
    map.set(numericId, { label, href });
  }
  return map;
}

function toResolvedItem(
  ctx: AppContext,
  node: TreeNode<MenuItemRow>,
  refs: ResolvedRefs,
): ResolvedMenuItem | null {
  const meta = parseMenuItemMeta(node.meta);
  if (!meta) return null;
  const resolved = resolveByKind(ctx, node, meta, refs);
  if (!resolved) return null;

  const children = node.children
    .map((child) => toResolvedItem(ctx, child, refs))
    .filter((child): child is ResolvedMenuItem => child !== null);

  // Menu-tree ancestor: any descendant is current. Pure JS walk over
  // the children we just built. Entity-tree ancestry (linked entry is
  // ancestor of current entry) is deliberately not built-in — it
  // requires walking the entries.parent_id chain at render time and
  // is a `menu:item` filter consumer's job when needed.
  const isAncestor = children.some(
    (child) => child.isCurrent || child.isAncestor,
  );

  return { ...resolved, isAncestor, children };
}

type ResolvedNoChildren = Omit<ResolvedMenuItem, "children" | "isAncestor">;

function resolveByKind(
  ctx: AppContext,
  node: TreeNode<MenuItemRow>,
  meta: MenuItemMeta,
  refs: ResolvedRefs,
): ResolvedNoChildren | null {
  const resolved = resolveLabelHrefSource(node, meta, refs);
  if (!resolved) return null;
  const isCurrent = isCurrentSource(ctx, currentSourceFor(resolved));
  return {
    id: node.id,
    parentId: node.parentId,
    label: resolved.label,
    href: resolved.href,
    target: meta.target,
    rel: meta.rel,
    cssClasses: meta.cssClasses ?? [],
    source: resolved.source,
    isCurrent,
  };
}

function currentSourceFor(
  resolved: LabelHrefSource,
):
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "custom"; readonly url: string } {
  if (resolved.source.kind === "custom") {
    return { kind: "custom", url: resolved.href };
  }
  return { kind: resolved.source.kind, id: resolved.source.id };
}

interface LabelHrefSource {
  readonly label: string;
  readonly href: string;
  readonly source: ResolvedMenuItem["source"];
}

function resolveLabelHrefSource(
  node: TreeNode<MenuItemRow>,
  meta: MenuItemMeta,
  refs: ResolvedRefs,
): LabelHrefSource | null {
  if (meta.kind === "custom") {
    const href = sanitizeMenuHref(meta.url);
    if (!href) return null;
    return { label: node.title, href, source: { kind: "custom" } };
  }
  if (meta.kind === "entry") {
    const ref = refs.entries.get(meta.entryId);
    if (!ref) return null;
    return { ...ref, source: { kind: "entry", id: meta.entryId } };
  }
  const ref = refs.terms.get(meta.termId);
  if (!ref) return null;
  return { ...ref, source: { kind: "term", id: meta.termId } };
}
