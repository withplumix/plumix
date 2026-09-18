// The part of `plumix` a plugin reaches for, plus valibot for its RPC inputs.
// Every value here is also on the root, which `facade-curated.test.ts` checks,
// so a plugin can import from either without two views of one symbol.
export type * from "@plumix/core";
export * as v from "valibot";

// Prefer `canEditEntry` / `assertCanEditEntry` to a hand-built
// `entry:<type>:edit_any`, which misses the namespace a pooled type gates
// under; `requireCapability` still covers row-independent checks.
export {
  ackEntryChanges,
  assertCanEditEntry,
  authenticated,
  base,
  canEditEntry,
  buildManifest,
  createAppContext,
  createPluginRegistry,
  definePlugin,
  escapeLikePattern,
  fallback,
  forArchiveType,
  HookRegistry,
  installPlugins,
  isCurrentSource,
  jsonResponse,
  listEntryMetaFields,
  McpToolError,
  memoryStorage,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
  readEntryChanges,
  registerCoreLookupAdapters,
  requestStore,
  requireCapability,
  runScheduledTasks,
  slugify,
  tryGetContext,
  withBasePath,
} from "@plumix/core";
