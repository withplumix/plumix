import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as LinguiCoreNs from "@lingui/core";
import * as LinguiReactNs from "@lingui/react";
import * as OrpcClientNs from "@orpc/client";
import * as OrpcClientFetchNs from "@orpc/client/fetch";
import * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";

import { adminBasePath } from "./admin-base.js";
import { pluginCatalogLoaderRef } from "./i18n-boot.js";
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
  linguiCore: LinguiCoreNs,
  linguiReact: LinguiReactNs,
} as const;

interface PlumixI18nGlobal {
  /** Load a third-party plugin's compiled catalog for the active
   *  locale. Plugins that mount admin chunks after initial boot call
   *  this from their entry to merge their catalog into the same
   *  Lingui instance the admin uses. */
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
    // Indirection through the ref so the manifest-bound loader
    // installed by `bootI18n` is reachable from plugin chunks that
    // load post-boot. Pre-boot callers hit the no-op default; the
    // call is then a silent miss (the chunk's `<Trans>` falls back
    // to `descriptor.message`). Plugin authors should call this
    // from `useEffect`, not module top-level.
    i18n: {
      loadPluginCatalog: (pluginId, locale) =>
        pluginCatalogLoaderRef.current(pluginId, locale),
    },
  };
}
