// Plugin admin entry. The plumix vite plugin namespace-imports this
// module and emits a `window.plumix.registerPluginPage("/menus",
// MenusShell)` call into the synthesised admin chunk based on the
// `component: "MenusShell"` ref we passed to `ctx.registerAdminPage`.
// All this entry has to do is expose the export by name.

import type { ComponentType } from "react";

import { MenusShell } from "./MenusShell.js";

interface PlumixWindowGlobal {
  readonly registerPluginPage: (path: string, component: ComponentType) => void;
}

declare const window:
  | {
      readonly plumix?: PlumixWindowGlobal;
    }
  | undefined;

if (typeof window !== "undefined") {
  window.plumix?.registerPluginPage("/menus", MenusShell);
}

export { MenusShell };
