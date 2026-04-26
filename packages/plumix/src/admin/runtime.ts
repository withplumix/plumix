// No `declare global { interface Window }` here — admin owns the
// Window.plumix shape (it carries the `register*` helpers in addition
// to `runtime`). This module is just the runtime slice plugin chunks
// see, plus the throw if it's missing.

import type * as OrpcClientNs from "@orpc/client";
import type * as OrpcClientFetchNs from "@orpc/client/fetch";
import type * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import type * as ReactQueryNs from "@tanstack/react-query";
import type * as ReactRouterNs from "@tanstack/react-router";
import type * as ReactNs from "react";
import type * as ReactDomNs from "react-dom";
import type * as ReactDomClientNs from "react-dom/client";
import type * as ReactJsxRuntimeNs from "react/jsx-runtime";

export interface PlumixAdminRuntime {
  readonly react: typeof ReactNs;
  readonly reactJsxRuntime: typeof ReactJsxRuntimeNs;
  readonly reactDom: typeof ReactDomNs;
  readonly reactDomClient: typeof ReactDomClientNs;
  readonly reactQuery: typeof ReactQueryNs;
  readonly reactRouter: typeof ReactRouterNs;
  readonly orpcClient: typeof OrpcClientNs;
  readonly orpcClientFetch: typeof OrpcClientFetchNs;
  readonly orpcTanstackQuery: typeof OrpcTanstackQueryNs;
}

export interface PlumixGlobal {
  readonly runtime?: PlumixAdminRuntime;
}

export function getRuntime(): PlumixAdminRuntime {
  const rt = (globalThis as { plumix?: PlumixGlobal }).plumix?.runtime;
  if (!rt) {
    throw new Error(
      "plumix admin runtime not initialised — plugin chunk loaded before host bundle.",
    );
  }
  return rt;
}
