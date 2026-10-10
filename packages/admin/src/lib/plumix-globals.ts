import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as LinguiCoreNs from "@lingui/core";
import * as LinguiReactNs from "@lingui/react";
import * as OrpcClientNs from "@orpc/client";
import * as OrpcClientFetchNs from "@orpc/client/fetch";
import * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as RadixNs from "radix-ui";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";
import * as SonnerNs from "sonner";
import * as TailwindMergeNs from "tailwind-merge";

import type { SharedAdminRuntimeKey } from "@plumix/core/admin";
import type { ConfiguredSlots } from "@plumix/core/manifest";

import { adminBasePath } from "./admin-base.js";
import { pluginCatalogLoaderRef } from "./i18n-boot.js";
import { getConfiguredSlots } from "./manifest.js";
import { registerPaletteCommand } from "./palette-commands.js";
import {
  registerPluginBlock,
  registerPluginBlockEditor,
  registerPluginBlockSchema,
  registerPluginDashboardWidget,
  registerPluginFieldType,
  registerPluginMarkSchema,
  registerPluginPage,
} from "./plugin-registry.js";

/**
 * Keyed by core's shim roster, the same keys `plumix/admin/*` shims read
 * through `PlumixAdminRuntime`: a missing or stray key fails to compile here
 * rather than reaching a plugin chunk as `undefined`.
 */
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
  linguiCore: LinguiCoreNs,
  linguiReact: LinguiReactNs,
  // Host instances so plugin chunks share Radix context, sonner's singleton and
  // the tailwind-merge cache.
  radix: RadixNs,
  sonner: SonnerNs,
  tailwindMerge: TailwindMergeNs,
} as const satisfies Record<SharedAdminRuntimeKey, unknown>;

interface PlumixI18nGlobal {
  readonly loadPluginCatalog: (
    pluginId: string,
    locale: string,
  ) => Promise<void>;
}

declare global {
  interface Window {
    plumix?: {
      readonly registerPluginPage: typeof registerPluginPage;
      readonly registerPluginDashboardWidget: typeof registerPluginDashboardWidget;
      readonly registerPluginFieldType: typeof registerPluginFieldType;
      readonly registerPluginBlockSchema: typeof registerPluginBlockSchema;
      readonly registerPluginBlockEditor: typeof registerPluginBlockEditor;
      readonly registerPluginBlock: typeof registerPluginBlock;
      readonly registerPluginMarkSchema: typeof registerPluginMarkSchema;
      readonly registerPaletteCommand: typeof registerPaletteCommand;
      readonly runtime: typeof runtime;
      readonly i18n: PlumixI18nGlobal;
      /** Subdirectory mount for plugin chunks to prefix their `/_plumix/...`
       *  fetches with; derived from the `<base href>` (see {@link adminBasePath}). */
      readonly basePath: string;
      /** Which infrastructure slots the deployment fills, read off the
       *  manifest; plugin chunks ask through `plumix/admin`'s
       *  `isSlotConfigured`. */
      readonly configuredSlots: ConfiguredSlots;
    };
  }
}

export function bootPlumixGlobals(): void {
  if (typeof window === "undefined") return;
  if (window.plumix) return;
  window.plumix = {
    registerPluginPage,
    registerPluginDashboardWidget,
    registerPluginFieldType,
    registerPluginBlockSchema,
    registerPluginBlockEditor,
    registerPluginBlock,
    registerPluginMarkSchema,
    registerPaletteCommand,
    runtime,
    basePath: adminBasePath(),
    configuredSlots: getConfiguredSlots(),
    // Through the ref so post-boot chunks reach the loader; a pre-boot call is
    // a silent miss.
    i18n: {
      loadPluginCatalog: (pluginId, locale) =>
        pluginCatalogLoaderRef.current(pluginId, locale),
    },
  };
}
