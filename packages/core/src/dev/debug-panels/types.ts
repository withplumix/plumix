import type { ReactNode } from "react";

import type { AppContext } from "../../context/app-context.js";
import type { Label } from "../../i18n/label.js";
import type { DebugSnapshot } from "../request-history/snapshot.js";

/**
 * A contributed debug-bar panel. Core registers its panels at `buildApp`
 * time; plugins add theirs via the `debug:panels` filter. `render` runs
 * server-side over a serializable {@link DebugSnapshot}, never live request
 * context.
 */
export interface DebugPanel {
  readonly id: string;
  readonly title: Label;
  /** Ascending; unset sorts after ordered panels (see DEFAULT_PANEL_ORDER). */
  readonly order?: number;
  /**
   * Rendered in its own SSR pass, so outer React context providers are not
   * visible; read request data off the snapshot, not `useContext`.
   */
  readonly render: (snapshot: DebugSnapshot) => ReactNode;
}

declare module "../../hooks/types.js" {
  interface FilterRegistry {
    "debug:panels": (
      panels: readonly DebugPanel[],
      ctx: AppContext,
    ) => readonly DebugPanel[];
  }
}
