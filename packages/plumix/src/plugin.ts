// The part of `plumix` a plugin reaches for, plus valibot for its RPC inputs.
// Every value here is also on the root, which `facade-curated.test.ts` checks,
// so a plugin can import from either without two views of one symbol.
export type * from "@plumix/core";
export * as v from "valibot";

export {
  ackEntryChanges,
  authenticated,
  base,
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
