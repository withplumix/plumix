import type { PluginRegistry } from "../../plugin/manifest.js";
import type { McpScope } from "./urls.js";
import { capabilitiesForRole } from "../rbac.js";
import { resolveApiTokenPreset } from "../token-presets.js";
import { MCP_SCOPES } from "./urls.js";

/**
 * The widest preset a space-separated `scope` names, since each holds the one
 * before it; `null` for an empty scope or an unknown value.
 */
export function parseScope(scope: string | undefined): McpScope | null {
  const values = (scope ?? "").split(" ").filter((value) => value !== "");
  if (values.length === 0) return null;
  let widest = -1;
  for (const value of values) {
    const rank = MCP_SCOPES.indexOf(value as McpScope);
    if (rank === -1) return null;
    widest = Math.max(widest, rank);
  }
  return MCP_SCOPES[widest] ?? null;
}

/** The capabilities `scope` stands for, for a person of `role` now. */
export function resolveScope(
  scope: McpScope,
  role: string,
  plugins: PluginRegistry,
): readonly string[] {
  switch (scope) {
    case "read":
      return resolveApiTokenPreset("read_only", role, plugins);
    case "draft":
      return resolveApiTokenPreset("draft_only", role, plugins);
    case "full":
      return capabilitiesForRole(role, plugins);
  }
}
