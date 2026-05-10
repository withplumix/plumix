import type { ComponentType } from "react";

import { AuditLogShell } from "./AuditLogShell.js";

interface PlumixWindowGlobal {
  readonly registerPluginPage: (path: string, component: ComponentType) => void;
}

declare const window:
  | {
      readonly plumix?: PlumixWindowGlobal;
    }
  | undefined;

if (typeof window !== "undefined") {
  window.plumix?.registerPluginPage("/audit-log", AuditLogShell);
}

export { AuditLogShell };
