import type { DevRuntime } from "../context/dev-runtime.js";
import type { MailCatalogs } from "../mail/catalogs.js";
import type { DeclaredMails } from "../mail/declared.js";
import type { MutablePluginRegistry } from "../plugin/manifest.js";
import { handleDebugRequests } from "./history-routes.js";
import { handleDebugMail } from "./mail/routes.js";

interface CoreDevRouteSources {
  readonly dev: DevRuntime;
  readonly mails: DeclaredMails;
  readonly catalogs: MailCatalogs;
}

/**
 * Call only under the `PLUMIX_DEV` gate, so this module and the route modules
 * leave production builds. Ahead of plugin routes, so a plugin id'd `debug`
 * cannot take these paths.
 */
export function registerCoreDevRoutes(
  registry: MutablePluginRegistry,
  { dev, mails, catalogs }: CoreDevRouteSources,
): void {
  registry.rawRoutes.unshift(
    {
      pluginId: "debug",
      method: "*",
      path: "/requests/*",
      auth: "development",
      handler: (_request, ctx) => handleDebugRequests(ctx, dev),
    },
    {
      pluginId: "debug",
      method: "*",
      path: "/mail/*",
      auth: "development",
      handler: (_request, ctx) =>
        handleDebugMail(ctx, dev, { mails, catalogs }),
    },
  );
}
