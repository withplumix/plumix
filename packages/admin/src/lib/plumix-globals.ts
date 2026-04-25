import {
  registerPluginBlock,
  registerPluginFieldType,
  registerPluginPage,
} from "./plugin-registry.js";

declare global {
  interface Window {
    plumix?: {
      readonly registerPluginPage: typeof registerPluginPage;
      readonly registerPluginBlock: typeof registerPluginBlock;
      readonly registerPluginFieldType: typeof registerPluginFieldType;
    };
  }
}

export function bootPlumixGlobals(): void {
  if (typeof window === "undefined") return;
  if (window.plumix) return;
  window.plumix = {
    registerPluginPage,
    registerPluginBlock,
    registerPluginFieldType,
  };
}
