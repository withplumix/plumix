import type { PluginRegistry } from "../plugin/manifest.js";
import { capabilitiesForRole } from "./rbac.js";
import { makeAuthCan } from "./with-user.js";

/**
 * The signed-in user as `auth.session` reports it and a server render embeds it.
 * Its capabilities are those `ctx.auth.can` grants, so a token's scopes narrow them.
 */
export function sessionUserOf(
  user: {
    readonly id: number;
    readonly email: string;
    readonly name?: string | null;
    readonly avatarUrl?: string | null;
    readonly role: string;
  },
  plugins: PluginRegistry,
  tokenScopes: readonly string[] | null,
) {
  const can = makeAuthCan(plugins, user, tokenScopes);
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    capabilities: capabilitiesForRole(user.role, plugins).filter(can),
  };
}
