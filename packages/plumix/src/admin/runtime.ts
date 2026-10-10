// No `declare global { interface Window }` here: admin owns the full
// `Window.plumix` shape.

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

import type { SharedAdminRuntimeKey } from "@plumix/core/admin";
import type {
  ConfiguredSlots,
  InfrastructureSlot,
} from "@plumix/core/manifest";

import { AdminRuntimeError } from "../errors.js";

interface SharedAdminNamespaces {
  react: typeof ReactNs;
  reactJsxRuntime: typeof ReactJsxRuntimeNs;
  reactDom: typeof ReactDomNs;
  reactDomClient: typeof ReactDomClientNs;
  reactQuery: typeof ReactQueryNs;
  reactRouter: typeof ReactRouterNs;
  orpcClient: typeof OrpcClientNs;
  orpcClientFetch: typeof OrpcClientFetchNs;
  orpcTanstackQuery: typeof OrpcTanstackQueryNs;
  linguiCore: typeof LinguiCoreNs;
  linguiReact: typeof LinguiReactNs;
  radix: typeof RadixNs;
  sonner: typeof SonnerNs;
  tailwindMerge: typeof TailwindMergeNs;
}

/**
 * Keyed by core's shim roster, which admin's runtime object is checked
 * against too: a roster key with no namespace here fails to index.
 */
export type PlumixAdminRuntime = {
  readonly [K in SharedAdminRuntimeKey]: SharedAdminNamespaces[K];
};

export interface PlumixGlobal {
  readonly runtime?: PlumixAdminRuntime;
  readonly basePath?: string;
  readonly configuredSlots?: ConfiguredSlots;
}

function plumixGlobal(): PlumixGlobal | undefined {
  return (globalThis as { plumix?: PlumixGlobal }).plumix;
}

export function getRuntime(): PlumixAdminRuntime {
  const rt = plumixGlobal()?.runtime;
  if (!rt) {
    throw AdminRuntimeError.notInitialised();
  }
  return rt;
}

/**
 * Whether the site's `plumix()` config fills `slot`. Not a hook: the roster is
 * fixed at build time, so it can't change during a session.
 */
export function isSlotConfigured(slot: InfrastructureSlot): boolean {
  const slots = plumixGlobal()?.configuredSlots;
  if (!slots) {
    throw AdminRuntimeError.notInitialised();
  }
  return slots[slot];
}

/**
 * The subdirectory the site is mounted under (`""` at the domain root), which
 * every worker-routed `/_plumix/...` URL plugin admin code builds must carry.
 */
export function basePath(): string {
  return plumixGlobal()?.basePath ?? "";
}
