// Nothing here runs on import, so the module tree-shakes out of production with
// the dev gate.

export { installDevClient } from "@plumix/core/dev-client";
export type {
  DevClientOptions,
  HmrClient,
  ViteErrorPayload,
} from "@plumix/core/dev-client";
