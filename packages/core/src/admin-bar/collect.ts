import type { HookExecutor } from "../hooks/registry.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";

export function collectAdminBarNodes(
  hooks: HookExecutor,
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  let nodes: readonly AdminBarNode[] = [];
  for (const { fn, plugin } of hooks.getFilterHandlers("admin_bar:nodes")) {
    try {
      const next = fn(nodes, ctx);
      if (Array.isArray(next)) {
        nodes = next;
      } else {
        console.error(
          `[plumix] admin_bar:nodes handler returned non-array plugin=${plugin ?? "core"}; contribution discarded`,
        );
      }
    } catch (error) {
      console.error(
        `[plumix] admin_bar:nodes handler failed plugin=${plugin ?? "core"}`,
        error,
      );
    }
  }
  return dedupeById(nodes);
}

function dedupeById(nodes: readonly AdminBarNode[]): readonly AdminBarNode[] {
  const byId = new Map<string, AdminBarNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      console.warn(
        `[plumix] admin_bar: duplicate node id "${node.id}" — last contributor wins`,
      );
    }
    byId.set(node.id, node);
  }
  return [...byId.values()];
}
