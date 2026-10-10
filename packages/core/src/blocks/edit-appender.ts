import type { ReactElement } from "react";
import { createElement } from "react";

import type { BlockContext } from "./render-block-tree.js";

const ADD_BLOCK = { id: "blocks.appender.addBlock", message: "Add a block" };

// Inline-styled because the canvas iframe carries the theme's CSS, not
// admin-ui's; a fixed muted gray reads as editor chrome on any background.
const STYLE: Record<string, string> = {
  display: "flex",
  width: "100%",
  boxSizing: "border-box",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "3rem",
  padding: "0.75rem 1rem",
  border: "1px dashed rgba(127,127,127,0.45)",
  borderRadius: "8px",
  color: "rgba(127,127,127,0.95)",
  background: "transparent",
  font: "inherit",
  fontSize: "0.875rem",
  cursor: "pointer",
};

/**
 * Edit-only. Carries data attributes for canvas click-delegation instead of a
 * handler, so the renderer stays pure. Omit `target` for the root document.
 */
export function editAppender(
  t: BlockContext["t"],
  target?: {
    readonly parentId: string;
    readonly slotKey: string;
  },
): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-plumix-add": "",
      ...(target && {
        "data-plumix-add-parent": target.parentId,
        "data-plumix-add-slot": target.slotKey,
      }),
      style: STYLE,
    },
    t(ADD_BLOCK),
  );
}
