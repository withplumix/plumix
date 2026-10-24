import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { capabilitiesForRole } from "./rbac.js";

/**
 * The narrowed presets a token can be minted from. "Same as me" is no preset:
 * it mints `scopes: null`.
 */
export const API_TOKEN_PRESETS = ["read_only", "draft_only"] as const;
export type ApiTokenPreset = (typeof API_TOKEN_PRESETS)[number];

/** Actions that only read, matched on a capability's last segment. */
const READ_ACTIONS: ReadonlySet<string> = new Set([
  "read",
  "read_revisions",
  "list",
]);

/** Publishing, trash and permanent delete, and overwriting from a revision. */
const NON_DRAFT_ACTIONS: ReadonlySet<string> = new Set([
  "publish",
  "delete",
  "restore_revision",
]);

function actionOf(capability: string): string {
  return capability.slice(capability.lastIndexOf(":") + 1);
}

/**
 * Resolved once, at mint, so a capability the role gains later never widens
 * the token.
 */
export function resolveApiTokenPreset(
  preset: ApiTokenPreset,
  role: UserRole,
  plugins: PluginRegistry,
): readonly string[] {
  const granted = capabilitiesForRole(role, plugins);
  return preset === "read_only"
    ? granted.filter((capability) => READ_ACTIONS.has(actionOf(capability)))
    : granted.filter(
        (capability) => !NON_DRAFT_ACTIONS.has(actionOf(capability)),
      );
}
