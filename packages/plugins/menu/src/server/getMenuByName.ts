import { and, eq, inArray } from "drizzle-orm";

import type { AppContext } from "@plumix/core";
import { entries, entryTerm, terms } from "@plumix/core";

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

/**
 * `name` is matched against `terms.slug` (NOT `terms.name`) — the parameter
 * name mirrors WordPress's `wp_get_nav_menu_object()`.
 *
 * Slice 1: only `kind: 'custom'` items resolve; `entry` and `term` items
 * (and their descendants) are dropped until slice 2 lands the permalink
 * helpers they depend on. Items with unparseable meta or unsafe URLs are
 * dropped the same way.
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

  const { tree } = buildTree(rows);
  const items = tree
    .map(toResolvedItem)
    .filter((item): item is ResolvedMenuItem => item !== null);

  return { termId: term.id, name: term.name, slug: term.slug, items };
}

function toResolvedItem(node: TreeNode<MenuItemRow>): ResolvedMenuItem | null {
  const meta = parseMenuItemMeta(node.meta);
  if (!meta) return null;
  const resolved = resolveByKind(node, meta);
  if (!resolved) return null;

  const children = node.children
    .map(toResolvedItem)
    .filter((child): child is ResolvedMenuItem => child !== null);

  return { ...resolved, children };
}

type ResolvedNoChildren = Omit<ResolvedMenuItem, "children">;

function resolveByKind(
  node: TreeNode<MenuItemRow>,
  meta: MenuItemMeta,
): ResolvedNoChildren | null {
  // Entry / term resolution lands in slice 2 (needs permalink helpers).
  // Drop silently so mixed menus stay partially functional in the meantime.
  if (meta.kind !== "custom") return null;

  const href = sanitizeMenuHref(meta.url);
  if (!href) return null;

  return {
    id: node.id,
    parentId: node.parentId,
    label: node.title,
    href,
    target: meta.target,
    rel: meta.rel,
    cssClasses: meta.cssClasses ?? [],
    source: { kind: "custom" },
  };
}
