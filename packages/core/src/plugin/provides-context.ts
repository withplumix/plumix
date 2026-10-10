import type { AppContextExtensions } from "../context/app-context.js";
import { PluginContextError } from "./errors.js";

export interface ContextExtensionEntry {
  readonly value: unknown;
  readonly pluginId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginContextExtensions {}

export interface PluginProvidesContext {
  readonly id: string;
  extendPluginContext<TKey extends keyof PluginContextExtensions>(
    key: TKey,
    value: PluginContextExtensions[TKey],
  ): void;
  /**
   * Augment `AppContextExtensions` to type `ctx.<key>`. Duplicate keys throw.
   */
  extendAppContext<TKey extends keyof AppContextExtensions>(
    key: TKey,
    value: AppContextExtensions[TKey],
  ): void;
}

interface CreateProvidesContextArgs {
  readonly pluginId: string;
  readonly pluginExtensions: Map<string, ContextExtensionEntry>;
  readonly appExtensions: Map<string, ContextExtensionEntry>;
}

// `__proto__` would reparent the ctx through the Object.prototype setter;
// `constructor`/`prototype` would shadow inherited members.
const RESERVED_EXTENSION_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// So a plugin can't silently replace `db`, `auth`, etc. at request time.
const APP_CONTEXT_BASE_KEYS: ReadonlySet<string> = new Set([
  "db",
  "env",
  "request",
  "user",
  "tokenScopes",
  "hooks",
  "plugins",
  "logger",
  "telemetry",
  // Assigned after the extension spread when a consumer samples, so the
  // request-time `key in target` shadow check never sees it — this
  // registration-time rejection is the only guard.
  "telemetryConsumers",
  "auth",
  "authenticator",
  "bootstrapAllowed",
  "authMethods",
  "after",
  "assets",
  "storage",
  "imageDelivery",
  "mailer",
  "config",
  "origin",
  "resolvedEntity",
]);

export function createPluginProvidesContext({
  pluginId,
  pluginExtensions,
  appExtensions,
}: CreateProvidesContextArgs): PluginProvidesContext {
  const stash = (
    target: Map<string, ContextExtensionEntry>,
    kind: "Plugin" | "App",
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
    extendAppContext: (key, value) => {
      stash(appExtensions, "App", key, value);
    },
  };
}
