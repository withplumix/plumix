import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { capabilitiesForRole } from "./rbac.js";

/** The signed-in user as `auth.session` reports it and a server render embeds it. */
export function sessionUserOf(
  user: {
    readonly id: number;
    readonly email: string;
    readonly name?: string | null;
    readonly avatarUrl?: string | null;
    readonly role: UserRole;
  },
  plugins: PluginRegistry,
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    capabilities: [...capabilitiesForRole(user.role, plugins)],
  };
}
