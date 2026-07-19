import type { ReactNode } from "react";

import type { AppContext } from "../context/app.js";
import type { Label } from "../i18n/label.js";

/**
 * A contributed debug-bar panel. Core registers its panels at `buildApp`
 * time; plugins add theirs via the `debug_bar:panels` filter. `render`
 * runs server-side when the bar is assembled and reads whatever it needs
 * off the request context (including its own collector bucket).
 */
export interface DebugPanel {
  readonly id: string;
  readonly title: Label;
  /** Ascending; unset sorts after ordered panels (see DEFAULT_PANEL_ORDER). */
  readonly order?: number;
  readonly render: (ctx: AppContext) => ReactNode;
}

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "debug_bar:panels": (
      panels: readonly DebugPanel[],
      ctx: AppContext,
    ) => readonly DebugPanel[];
  }
}
