import type { ReactNode } from "react";

import type { AppContext } from "../../../context/app.js";

/**
 * A plugin-contributed dev error page panel (#1626). Plugins add theirs via the
 * dev-only `error_page:panels` filter, mirroring how they contribute to the
 * debug bar via `debug_bar:panels`. `render` runs server-side in its own
 * isolated SSR pass — so a throw can't crash the very page meant to surface it —
 * and receives the caught value and the live request context, the same pair the
 * `error_page:hints` filter passes.
 */
export interface DevErrorPanel {
  /** Stable id — dedupes contributors (last wins) and keys the section. */
  readonly id: string;
  /** Section heading; a dev-only English string, like a hint's title. */
  readonly title: string;
  /** Ascending; unset sorts after ordered panels (see collectDevErrorPanels). */
  readonly order?: number;
  /**
   * Rendered in isolation to inert HTML. Read what you need off the caught
   * `error` and the request `ctx` (its telemetry collector, resolved entity,
   * wired slots). A throw here yields a fallback notice, not a crashed page.
   */
  readonly render: (error: unknown, ctx: AppContext) => ReactNode;
}

/**
 * The dev-only panel filter (#1626). Runs on every 5xx the dev error page
 * renders: each handler receives the panels gathered so far, the raw thrown
 * value, and the request context, and returns the next panel list. Core
 * contributes none of its own — its built-in context sections cover that — so
 * this filter is purely the plugin-facing panel API. Mirrors `error_page:hints`
 * and `debug_bar:panels`.
 */
declare module "../../../hooks/types.js" {
  interface FilterRegistry {
    "error_page:panels": (
      panels: readonly DevErrorPanel[],
      error: unknown,
      ctx: AppContext,
    ) => readonly DevErrorPanel[];
  }
}
