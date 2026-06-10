import type { PluginRegistry } from "../plugin/manifest.js";
import type { McpTool } from "./tool.js";
import { contentGetTool, contentListTool } from "./content-tools.js";
import { schemaDescribeTool } from "./schema-describe.js";

/**
 * Tools core contributes unconditionally — the MCP analogue of `appRouter`.
 * Plugins add their own through `registerMcpTool`; the two merge in
 * {@link buildMcpToolRegistry}.
 */
export const coreMcpTools: readonly McpTool[] = [
  schemaDescribeTool,
  contentListTool,
  contentGetTool,
];

export const CORE_MCP_TOOL_NAMES: ReadonlySet<string> = new Set(
  coreMcpTools.map((tool) => tool.name),
);

/** Merge core tools with plugin-registered tools into a name-keyed map.
 *  Collisions are already rejected at registration, so insertion is plain. */
export function buildMcpToolRegistry(
  plugins: PluginRegistry,
): Map<string, McpTool> {
  const tools = new Map<string, McpTool>();
  for (const tool of coreMcpTools) tools.set(tool.name, tool);
  for (const { tool } of plugins.mcpTools.values()) tools.set(tool.name, tool);
  return tools;
}
