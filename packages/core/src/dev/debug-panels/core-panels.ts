import type { MutableDevRuntime } from "../../context/dev-runtime.js";
import { registerDevItem } from "../registrations.js";
import { appPanel } from "./builtin/app.js";
import { databasePanel } from "./builtin/database.js";
import { mailPanel } from "./builtin/mail.js";
import { requestPanel } from "./builtin/request.js";
import { templatePanel } from "./builtin/template.js";
import { timelinePanel } from "./builtin/timeline.js";

/**
 * Registers core's built-in debug panels. Wired at `buildApp` time behind
 * the dev gate, before any plugin, so a plugin reusing a core id fails boot.
 */
export function registerCoreDebugPanels(dev: MutableDevRuntime): void {
  for (const panel of [
    requestPanel,
    templatePanel,
    databasePanel,
    mailPanel,
    timelinePanel,
    appPanel,
  ]) {
    registerDevItem(dev.debugPanels, "debug panel", panel, null);
  }
}
