import type { ReactNode } from "react";

import type { RenderedDebugPanel } from "./render-panels.js";
import { labelSourceText } from "../../i18n/label.js";

// One radio group drives the tabs; the label's `for` targets the matching
// radio so `:checked` alone (no JS) shows the active pane.
const TAB_RADIO_NAME = "plumix-debug-tab";

/**
 * Shared by the inline bar and the `?format=html` read route, so a fragment
 * the switcher swaps in is the same markup the bar renders.
 */
export function DebugPanelTabs({
  rendered,
}: {
  readonly rendered: readonly RenderedDebugPanel[];
}): ReactNode {
  return (
    <>
      {rendered.map((panel, index) => (
        <input
          key={panel.id}
          className="plumix-debug-bar__radio"
          type="radio"
          name={TAB_RADIO_NAME}
          id={`${TAB_RADIO_NAME}-${panel.id}`}
          defaultChecked={index === 0}
        />
      ))}
      <nav className="plumix-debug-bar__labels">
        {rendered.map((panel) => (
          <label key={panel.id} htmlFor={`${TAB_RADIO_NAME}-${panel.id}`}>
            {labelSourceText(panel.title)}
          </label>
        ))}
      </nav>
      <div className="plumix-debug-bar__panes">
        {rendered.map((panel) => (
          <section
            key={panel.id}
            className="plumix-debug-bar__pane"
            data-testid={`plumix-debug-panel-${panel.id}`}
            dangerouslySetInnerHTML={{ __html: panel.html }}
          />
        ))}
      </div>
    </>
  );
}
