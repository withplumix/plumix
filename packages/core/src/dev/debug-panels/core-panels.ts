import type { HookRegistry } from "../../hooks/registry.js";
import type { DebugPanel } from "./types.js";
import { appPanel } from "./builtin/app.js";
import { databasePanel } from "./builtin/database.js";
import { mailPanel } from "./builtin/mail.js";
import { requestPanel } from "./builtin/request.js";
import { templatePanel } from "./builtin/template.js";
import { timelinePanel } from "./builtin/timeline.js";

/**
 * Registers core's built-in debug panels. Wired at `buildApp` time behind
 * the dev gate, at low priority so plugin panels (default priority 100)
 * sort after core's.
 */
export function registerCoreDebugPanels(hooks: HookRegistry): void {
  hooks.addFilter(
    "debug:panels",
    (panels: readonly DebugPanel[]) => [
      ...panels,
      requestPanel,
      templatePanel,
      databasePanel,
      mailPanel,
      timelinePanel,
      appPanel,
    ],
    { plugin: "core", priority: 10 },
  );
}
