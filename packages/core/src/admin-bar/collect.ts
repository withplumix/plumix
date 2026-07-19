import type { HookExecutor } from "../hooks/registry.js";
import type { AdminBarNode, BarRenderContext } from "./types.js";

export function collectAdminBarNodes(
  hooks: HookExecutor,
  ctx: BarRenderContext,
): readonly AdminBarNode[] {
  const nodes = hooks.applyFilterIsolated("admin_bar:nodes", [], ctx);
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
