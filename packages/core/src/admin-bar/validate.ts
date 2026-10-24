import type { RegisteredAdminBarNode } from "../plugin/admin-bar-node.js";
import { PluginDefinitionError } from "../plugin/errors.js";

/**
 * At boot, once every node is registered: a typo'd parent would otherwise
 * render its child at the bar's top level.
 */
export function assertAdminBarParentsRegistered(
  nodes: ReadonlyMap<string, RegisteredAdminBarNode>,
): void {
  for (const node of nodes.values()) {
    if (node.parent === undefined || nodes.has(node.parent)) continue;
    throw PluginDefinitionError.adminBarNodeReferencesUnknownParent({
      nodeId: node.id,
      parent: node.parent,
    });
  }
}
