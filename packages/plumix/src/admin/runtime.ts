// No `declare global { interface Window }` here — admin owns the
// Window.plumix shape (it carries the `register*` helpers in addition
// to `runtime`). This module is just the runtime slice plugin chunks
// see, plus the throw if it's missing.

import type * as LinguiCoreNs from "@lingui/core";
import type * as LinguiReactNs from "@lingui/react";
import type * as OrpcClientNs from "@orpc/client";
import type * as OrpcClientFetchNs from "@orpc/client/fetch";
import type * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import type * as ReactQueryNs from "@tanstack/react-query";
import type * as ReactRouterNs from "@tanstack/react-router";
import type * as RadixNs from "radix-ui";
import type * as ReactNs from "react";
import type * as ReactDomNs from "react-dom";
import type * as ReactDomClientNs from "react-dom/client";
import type * as ReactJsxRuntimeNs from "react/jsx-runtime";
import type * as SonnerNs from "sonner";
import type * as TailwindMergeNs from "tailwind-merge";

import { AdminRuntimeError } from "../errors.js";

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
  readonly linguiCore: typeof LinguiCoreNs;
  readonly linguiReact: typeof LinguiReactNs;
  readonly radix: typeof RadixNs;
  readonly sonner: typeof SonnerNs;
  readonly tailwindMerge: typeof TailwindMergeNs;
}

export interface PlumixGlobal {
  readonly runtime?: PlumixAdminRuntime;
}

export function getRuntime(): PlumixAdminRuntime {
  const rt = (globalThis as { plumix?: PlumixGlobal }).plumix?.runtime;
  if (!rt) {
    throw AdminRuntimeError.notInitialised();
  }
  return rt;
}
