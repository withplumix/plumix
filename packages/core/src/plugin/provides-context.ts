import type { AppContextExtensions } from "../context/app.js";
import { PluginContextError } from "./errors.js";

export interface ContextExtensionEntry {
  readonly value: unknown;
  readonly pluginId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginContextExtensions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ThemeContextExtensions {}

export interface PluginProvidesContext {
  readonly id: string;
  extendPluginContext<TKey extends keyof PluginContextExtensions>(
    key: TKey,
    value: PluginContextExtensions[TKey],
  ): void;
  extendThemeContext<TKey extends keyof ThemeContextExtensions>(
    key: TKey,
    value: ThemeContextExtensions[TKey],
  ): void;
  /**
   * Register a runtime helper on every per-request `AppContext`. Reads
   * are typed via the `AppContextExtensions` declaration-merge target —
   * a plugin augments it once and `ctx.<key>` is autocompleted in
   * every RPC/route/hook handler. Duplicate keys throw.
   */
  extendAppContext<TKey extends keyof AppContextExtensions>(
    key: TKey,
    value: AppContextExtensions[TKey],
  ): void;
}

export interface CreateProvidesContextArgs {
  readonly pluginId: string;
  readonly pluginExtensions: Map<string, ContextExtensionEntry>;
  readonly themeExtensions: Map<string, ContextExtensionEntry>;
  readonly appExtensions: Map<string, ContextExtensionEntry>;
}

// Names that would corrupt the per-request `AppContext` if a plugin
// tried to register them. `__proto__` triggers the Object.prototype
// setter and reparents the ctx; `constructor` / `prototype` shadow
// inherited members and confuse downstream introspection.
const RESERVED_EXTENSION_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Built-in `AppContextBase` members. extendAppContext rejects these so
// a plugin can't silently replace `db`, `auth`, etc. at request time.
// Mirrors the `key in target` shadow check `extendPluginContext`
// runs against the constructed PluginSetupContext at install.
const APP_CONTEXT_BASE_KEYS: ReadonlySet<string> = new Set([
  "db",
  "env",
  "request",
  "user",
  "tokenScopes",
  "hooks",
  "plugins",
  "logger",
  "auth",
  "authenticator",
  "bootstrapAllowed",
  "oauthProviders",
  "after",
  "assets",
  "storage",
  "imageDelivery",
  "mailer",
  "origin",
  "siteName",
  "resolvedEntity",
]);

export function createPluginProvidesContext({
  pluginId,
  pluginExtensions,
  themeExtensions,
  appExtensions,
}: CreateProvidesContextArgs): PluginProvidesContext {
  const stash = (
    target: Map<string, ContextExtensionEntry>,
    kind: "Plugin" | "Theme" | "App",
    key: string,
    value: unknown,
  ): void => {
    if (typeof key !== "string" || key.length === 0) {
      throw PluginContextError.extendContextInvalidKey({ pluginId, kind });
    }
    if (RESERVED_EXTENSION_KEYS.has(key)) {
      throw PluginContextError.extendContextReservedKey({
        pluginId,
        kind,
        key,
      });
    }
    if (kind === "App" && APP_CONTEXT_BASE_KEYS.has(key)) {
      throw PluginContextError.extendAppContextBuiltinCollision({
        pluginId,
        key,
      });
    }
    const existing = target.get(key);
    if (existing) {
      throw PluginContextError.extendContextDuplicate({
        pluginId,
        kind,
        key,
        existingOwner: existing.pluginId,
      });
    }
    target.set(key, { value, pluginId });
  };
  return {
    id: pluginId,
    extendPluginContext: (key, value) => {
      stash(pluginExtensions, "Plugin", key, value);
    },
    extendThemeContext: (key, value) => {
      stash(themeExtensions, "Theme", key, value);
    },
    extendAppContext: (key, value) => {
      stash(appExtensions, "App", key, value);
    },
  };
}
