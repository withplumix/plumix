import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";

import {
  registerPluginBlock,
  registerPluginFieldType,
  registerPluginPage,
} from "./plugin-registry.js";

// The runtime bag the per-site plugin bundle reads via `plumix/admin/*`
// shims. Listed here (not destructured into a const) so the property
// names line up exactly with the `PlumixAdminRuntime` type in
// `plumix/admin/runtime`.
const runtime = {
  react: ReactNs,
  reactJsxRuntime: ReactJsxRuntimeNs,
  reactDom: ReactDomNs,
  reactDomClient: ReactDomClientNs,
  reactQuery: ReactQueryNs,
  reactRouter: ReactRouterNs,
} as const;

declare global {
  interface Window {
    plumix?: {
      readonly registerPluginPage: typeof registerPluginPage;
      readonly registerPluginBlock: typeof registerPluginBlock;
      readonly registerPluginFieldType: typeof registerPluginFieldType;
      readonly runtime: typeof runtime;
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
    runtime,
  };
}
