import type { HookRegistry } from "../hooks/registry.js";
import type { DebugPanel } from "./types.js";
import { requestPanel } from "./panels/request.js";

/**
 * Registers core's built-in debug panels. Wired at `buildApp` time behind
 * the dev gate, at low priority so plugin panels (default priority 100)
 * sort after core's. Mirrors `registerCoreAdminBarContributors`.
 */
export function registerCoreDebugPanels(hooks: HookRegistry): void {
  hooks.addFilter(
    "debug_bar:panels",
    (panels: readonly DebugPanel[]) => [...panels, requestPanel],
    { plugin: "core", priority: 10 },
  );
}
