import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DevOverlayShell } from "./overlay-shell.js";

describe("DevOverlayShell", () => {
  test("renders the label, an aria-labeled dialog, and its body children", () => {
    const html = renderToStaticMarkup(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={() => undefined}
      >
        <p>the error</p>
      </DevOverlayShell>,
    );

    expect(html).toContain(
      '<div class="plumix-dev-overlay__modal" data-testid="plumix-dev-overlay-panel" role="dialog" aria-label="Client error">',
    );
    expect(html).toContain(
      '<span class="plumix-dev-overlay__label" data-testid="plumix-dev-overlay-label">Counter</span>',
    );
    expect(html).toContain(
      '<div class="plumix-dev-overlay__body"><p>the error</p></div>',
    );
  });

  test("renders bar actions between the label and the close button", () => {
    const html = renderToStaticMarkup(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={() => undefined}
        actions={<span>nav</span>}
      >
        <p>body</p>
      </DevOverlayShell>,
    );

    expect(html).toContain(
      'Counter</span><span>nav</span><button type="button" class="plumix-dev-overlay__btn" data-testid="plumix-dev-overlay-close"',
    );
  });
});
