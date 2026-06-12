import type { ComponentType } from "react";

import { CommentsShell } from "./CommentsShell.js";

interface PlumixWindowGlobal {
  readonly registerPluginPage: (path: string, component: ComponentType) => void;
}

declare const window:
  | {
      readonly plumix?: PlumixWindowGlobal;
    }
  | undefined;

if (typeof window !== "undefined") {
  window.plumix?.registerPluginPage("/comments", CommentsShell);
}

export { CommentsShell };
