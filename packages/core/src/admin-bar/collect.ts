import type { Logger } from "../context/app-context.js";
import type { RegisteredAdminBarNode } from "../plugin/admin-bar-node.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";
import { logErrorSafely } from "../context/log.js";

export function collectAdminBarNodes(
  registered: Iterable<RegisteredAdminBarNode>,
  bar: BarRenderContext,
  logger: Logger,
): readonly AdminBarNode[] {
  const shown: AdminBarNode[] = [];
  for (const node of [...registered].sort(byOrder)) {
    try {
      if (node.visible?.(bar) ?? true) shown.push(resolve(node, bar));
    } catch (error) {
      // One node's bug hides that node only, never the bar.
      logErrorSafely(logger, "admin_bar_node_failed", error, {
        node: node.id,
        plugin: node.registeredBy ?? "core",
      });
    }
  }
  return withShownParents(shown);
}

const ORDER_RANK = { early: 0, default: 1, late: 2 } as const;

/** Stable, so registration order breaks a tie within one order. */
function byOrder(a: RegisteredAdminBarNode, b: RegisteredAdminBarNode): number {
  return ORDER_RANK[a.order ?? "default"] - ORDER_RANK[b.order ?? "default"];
}

function resolve(
  { id, group, parent, position, action, title, href }: RegisteredAdminBarNode,
  bar: BarRenderContext,
): AdminBarNode {
  const url = href?.(bar);
  return {
    id,
    group,
    title: typeof title === "string" ? title : title(bar),
    ...(url === undefined ? {} : { href: url }),
    ...(parent === undefined ? {} : { parent }),
    ...(position === undefined ? {} : { position }),
    ...(action === undefined ? {} : { action }),
  };
}

/** A node left out takes its subtree with it. */
function withShownParents(
  nodes: readonly AdminBarNode[],
): readonly AdminBarNode[] {
  let kept = nodes;
  for (;;) {
    const ids = new Set(kept.map((node) => node.id));
    const next = kept.filter(
      (node) => node.parent === undefined || ids.has(node.parent),
    );
    if (next.length === kept.length) return kept;
    kept = next;
  }
}
