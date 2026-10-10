import type { ReactNode } from "react";

import type { AppContext } from "../../../context/app-context.js";

export interface DevErrorPanel {
  /** Stable id — dedupes contributors (last wins) and keys the section. */
  readonly id: string;
  /** Section heading; a dev-only English string, like a hint's title. */
  readonly title: string;
  /**
   * Ascending; unset sorts after ordered panels (see collectDevErrorPanels).
   */
  readonly order?: number;
  /** Rendered in isolation to inert HTML; a throw yields a fallback notice. */
  readonly render: (error: unknown, ctx: AppContext) => ReactNode;
}

declare module "../../../hooks/types.js" {
  interface FilterRegistry {
    "error_page:panels": (
      panels: readonly DevErrorPanel[],
      error: unknown,
      ctx: AppContext,
    ) => readonly DevErrorPanel[];
  }
}
