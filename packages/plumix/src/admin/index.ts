// The per-lib shims (`plumix/admin/react`, `/radix`, …) are an internal
// build-tool contract with no stability guarantee: the plugin-bundle step
// rewrites bare imports to them to share singletons.

export { basePath, getRuntime, isSlotConfigured } from "./runtime.js";
export type { PlumixAdminRuntime, PlumixGlobal } from "./runtime.js";
export type {
  ConfiguredSlots,
  InfrastructureSlot,
} from "@plumix/core/manifest";

export { createPluginRpcClient } from "./plugin-rpc.js";
export type {
  PluginRpcClient,
  PluginRpcInputs,
  PluginRpcOutputs,
} from "@plumix/core";

export {
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
  adminRuntimeShimSlug,
  describeRpcError,
  rpcErrorCode,
  rpcErrorReason,
} from "@plumix/core/admin";
export type {
  SharedAdminRuntimeKey,
  SharedAdminRuntimeSpecifier,
} from "@plumix/core/admin";
