import type { HookRegistry } from "../hooks/registry.js";
import type { DebugPanel } from "./types.js";
import { appPanel } from "./panels/app.js";
import { databasePanel } from "./panels/database.js";
import { requestPanel } from "./panels/request.js";
import { templatePanel } from "./panels/template.js";
import { timelinePanel } from "./panels/timeline.js";

/**
 * Registers core's built-in debug panels. Wired at `buildApp` time behind
 * the dev gate, at low priority so plugin panels (default priority 100)
 * sort after core's. Mirrors `registerCoreAdminBarContributors`.
 */
export function registerCoreDebugPanels(hooks: HookRegistry): void {
  hooks.addFilter(
    "debug_bar:panels",
    (panels: readonly DebugPanel[]) => [
      ...panels,
      requestPanel,
      templatePanel,
      databasePanel,
      timelinePanel,
      appPanel,
    ],
    { plugin: "core", priority: 10 },
  );
}
