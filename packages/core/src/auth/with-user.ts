import type {
  AppContext,
  AuthenticatedAppContext,
  AuthenticatedUser,
} from "../context/app-context.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { Capability } from "./contract/capability.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import { resolveCapability } from "./contract/capability.js";
import { getCapabilityResolver } from "./rbac.js";

export function makeAuthCan(
  plugins: PluginRegistry,
  user: AuthenticatedUser | null,
  tokenScopes: readonly string[] | null,
): (capability: Capability) => boolean {
  if (user === null) return () => false;
  const resolver = getCapabilityResolver(plugins);
  if (tokenScopes === null) {
    return (capability) =>
      resolver.hasCapability(user.role, resolveCapability(plugins, capability));
  }
  // Pre-build the Set so each can() call is O(1) instead of O(scopes).
  // Token-authed requests are the hot path; the Set is per-request,
  // tiny, and sees ≥1 lookups per request typically.
  const scopeSet = new Set(tokenScopes);
  return (capability) => {
    const name = resolveCapability(plugins, capability);
    return scopeSet.has(name) && resolver.hasCapability(user.role, name);
  };
}

export function withUser<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
  user: AuthenticatedUser,
  tokenScopes: readonly string[] | null = null,
): AuthenticatedAppContext<TSchema> {
  return {
    ...ctx,
    user,
    tokenScopes,
    auth: {
      can: makeAuthCan(ctx.plugins, user, tokenScopes),
    },
    locale: resolveLocale({
      request: ctx.request,
      user,
      i18n: ctx.config.i18n,
    }),
  };
}
