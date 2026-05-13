import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as OrpcClientNs from "@orpc/client";
import * as OrpcClientFetchNs from "@orpc/client/fetch";
import * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";

import {
  registerPluginFieldType,
  registerPluginPage,
} from "./plugin-registry.js";

// Property names line up with `PlumixAdminRuntime` in
// `plumix/admin/runtime` — keep in sync.
const runtime = {
  react: ReactNs,
  reactJsxRuntime: ReactJsxRuntimeNs,
  reactDom: ReactDomNs,
  reactDomClient: ReactDomClientNs,
  reactQuery: ReactQueryNs,
  reactRouter: ReactRouterNs,
  orpcClient: OrpcClientNs,
  orpcClientFetch: OrpcClientFetchNs,
  orpcTanstackQuery: OrpcTanstackQueryNs,
} as const;

declare global {
  interface Window {
    plumix?: {
      readonly registerPluginPage: typeof registerPluginPage;
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
    registerPluginFieldType,
    runtime,
  };
}
