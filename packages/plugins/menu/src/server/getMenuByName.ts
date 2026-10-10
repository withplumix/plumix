import type { JsonObject } from "plumix";
import type { AppContext, LookupResult } from "plumix/plugin";
import { and, eq, inArray } from "plumix/db";
import {
  isCurrentSource,
  memoBatch,
  resolveEntryList,
  tagCdnEntry,
} from "plumix/plugin";
import { entries, entryTerm, terms } from "plumix/schema";

import type { TreeNode } from "./buildTree.js";
import type { MenuItemMeta, ResolvedMenu, ResolvedMenuItem } from "./types.js";
import { buildTree } from "./buildTree.js";
import { menuTag } from "./cache-tags.js";
import { isMenuEligible } from "./eligibility.js";
import { itemOwnLabel } from "./label.js";
import { parseMenuItemMeta } from "./parseMeta.js";
import { sanitizeMenuHref } from "./url.js";

interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: JsonObject;
}

interface ResolvedRef {
  readonly label: string;
  readonly href: string;
}

/**
 * `name` matches `terms.slug`, not `terms.name`, as WordPress's
 * `wp_get_nav_menu_object()` does. Items whose target doesn't resolve drop
 * silently with their descendants.
 */
export async function getMenuByName(
  ctx: AppContext,
  name: string,
  options?: { readonly location?: string | null },
): Promise<ResolvedMenu | null> {
  const [resolved] = await resolveMenus(ctx, [
    { slug: name, location: options?.location ?? null },
  ]);
  return resolved ?? null;
}

export async function getMenusByName(
  ctx: AppContext,
  names: readonly string[],
): Promise<Record<string, ResolvedMenu | null>> {
  const unique = [...new Set(names)];
  const resolved = await resolveMenus(
    ctx,
    unique.map((slug) => ({ slug, location: null })),
  );
  return Object.fromEntries(
    unique.map((slug, i) => [slug, resolved[i] ?? null]),
  );
}

interface MenuRequest {
  readonly slug: string;
  readonly location: string | null;
}

/**
 * Not part of the package surface. Results align with `requests` by index; each
 * request gets its own hook pass.
 */
export async function resolveMenus(
  ctx: AppContext,
  requests: readonly MenuRequest[],
): Promise<(ResolvedMenu | null)[]> {
  // Only the query cluster is memoized; hooks and `isCurrent` still run per
  // call with that call's own context.
  const unique = [...new Set(requests.map((r) => r.slug))];
  const clusters = await memoBatch(
    ctx.memo,
    requests.map((r) => r.slug),
    (slug) => `menu:data:${slug}`,
    () => loadMenuData(ctx, unique),
  );

  return Promise.all(
    requests.map(async ({ location }, i) => {
      const data = clusters[i];
      if (!data) return null;
      tagCdnEntry(ctx, [menuTag(data.term.id), ...linkedEntryTags(ctx, data)]);
      const { tree } = buildTree(data.rows);
      const resolved = await Promise.all(
        tree.map((node) => toResolvedItem(ctx, node, data.refs)),
      );
      const items = resolved.filter(
        (item): item is ResolvedMenuItem => item !== null,
      );

      const filtered = await ctx.hooks.applyFilter("menu:tree", items, {
        location,
        termId: data.term.id,
      });

      return {
        termId: data.term.id,
        name: data.term.name,
        slug: data.term.slug,
        items: filtered,
      };
    }),
  );
}

// Every entry the menu links, resolved or not: the label and href are the
// entry's, and a draft that gets published has to appear in the cached nav.
function linkedEntryTags(ctx: AppContext, data: MenuData): string[] {
  const adapter = ctx.plugins.lookupAdapters.get("entry")?.adapter;
  if (adapter?.embeddedCacheTags === undefined) return [];
  const tags: string[] = [];
  for (const row of data.rows) {
    const meta = parseMenuItemMeta(row.meta);
    if (meta?.kind === "entry") {
      tags.push(...adapter.embeddedCacheTags(String(meta.entryId)));
    }
  }
  return tags;
}

interface MenuData {
  readonly term: {
    readonly id: number;
    readonly name: string;
    readonly slug: string;
  };
  readonly rows: readonly MenuItemRow[];
  readonly refs: ResolvedRefs;
}

async function loadMenuData(
  ctx: AppContext,
  slugs: readonly string[],
): Promise<Map<string, MenuData>> {
  const data = new Map<string, MenuData>();
  const termRows = await ctx.db
    .select({ id: terms.id, name: terms.name, slug: terms.slug })
    .from(terms)
    .where(and(eq(terms.taxonomy, "menu"), inArray(terms.slug, [...slugs])));
  if (termRows.length === 0) return data;

  const rows = await ctx.db
    .select({
      id: entries.id,
      parentId: entries.parentId,
      sortOrder: entries.sortOrder,
      title: entries.title,
      meta: entries.meta,
      termId: entryTerm.termId,
    })
    .from(entries)
    .innerJoin(entryTerm, eq(entryTerm.entryId, entries.id))
    .where(
      and(
        eq(entries.type, "menu_item"),
        // Trashed/draft menu items must not surface in public nav. Only
        // `published` is a real lifecycle state for menu items today; if
        // the admin (slice 7+) introduces a drafting flow, revisit.
        eq(entries.status, "published"),
        inArray(
          entryTerm.termId,
          termRows.map((t) => t.id),
        ),
      ),
    )
    .orderBy(entries.parentId, entries.sortOrder, entries.id);

  const rowsByTerm = new Map<number, MenuItemRow[]>();
  for (const { termId, ...row } of rows) {
    const bucket = rowsByTerm.get(termId);
    if (bucket) bucket.push(row);
    else rowsByTerm.set(termId, [row]);
  }

  // `refs` is the union across the batch; per-slug items look up by id.
  const refs = await resolveRefs(ctx, rows);
  for (const term of termRows) {
    data.set(term.slug, {
      term,
      rows: rowsByTerm.get(term.id) ?? [],
      refs,
    });
  }
  return data;
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
    .filter(isMenuEligible)
    .map((t) => t.name);
  if (eligibleTypes.length === 0) return new Map();

  // The entry adapter admits drafts and scheduled entries, which the picker
  // wants but public nav must not render.
  const results = await adapter.list(ctx, {
    scope: { entryTypes: eligibleTypes, status: "published" },
    ids: [...ids].map(String),
  });
  const refs = refMapFromResults(results);
  if (refs.size === 0) return refs;

  // The adapter label is the raw title; public nav shows the page's title with
  // shortcodes expanded.
  const rows = await ctx.db
    .select()
    .from(entries)
    .where(inArray(entries.id, [...refs.keys()]));
  for (const entry of await resolveEntryList(ctx, rows)) {
    const ref = refs.get(entry.id);
    if (!ref) continue;
    const title = entry.title.trim();
    refs.set(entry.id, { ...ref, label: title === "" ? "(unnamed)" : title });
  }
  return refs;
}

async function resolveTermRefs(
  ctx: AppContext,
  ids: ReadonlySet<number>,
): Promise<Map<number, ResolvedRef>> {
  const adapter = ctx.plugins.lookupAdapters.get("term")?.adapter;
  if (!adapter) return new Map();

  const eligibleTaxonomies = [...ctx.plugins.termTaxonomies.values()]
    .filter(isMenuEligible)
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
    const href = result.href ?? null;
    if (!href) continue; // No public URL → can't render in nav
    // Don't ship an English "Untitled <type>" into the SSR nav.
    const label = result.label ?? "(unnamed)";
    map.set(numericId, { label, href });
  }
  return map;
}

async function toResolvedItem(
  ctx: AppContext,
  node: TreeNode<MenuItemRow>,
  refs: ResolvedRefs,
): Promise<ResolvedMenuItem | null> {
  const meta = parseMenuItemMeta(node.meta);
  if (!meta) return null;
  const resolved = resolveByKind(ctx, node, meta, refs);
  if (!resolved) return null;

  const childResults = await Promise.all(
    node.children.map((child) => toResolvedItem(ctx, child, refs)),
  );
  const children = childResults.filter(
    (child): child is ResolvedMenuItem => child !== null,
  );

  // Entity-tree ancestry is left to `menu:item` filters: it needs a parent_id
  // walk at render time.
  const isAncestor = children.some(
    (child) => child.isCurrent || child.isAncestor,
  );

  // Per-item filter runs after children resolve so subscribers see the
  // already-transformed subtree. Tree-level filter still runs once on
  // the full assembled array in `getMenuByName`.
  return ctx.hooks.applyFilter("menu:item", {
    ...resolved,
    isAncestor,
    children,
  });
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
    return {
      label: itemOwnLabel(node.title) ?? ref.label,
      href: ref.href,
      source: { kind: "entry", id: meta.entryId },
    };
  }
  const ref = refs.terms.get(meta.termId);
  if (!ref) return null;
  return {
    label: itemOwnLabel(node.title) ?? ref.label,
    href: ref.href,
    source: { kind: "term", id: meta.termId },
  };
}
