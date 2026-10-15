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

    expect(html).toMatch(
      /data-testid="plumix-dev-overlay-panel"[^>]*role="dialog"[^>]*aria-label="Client error"/,
    );
    expect(html).toMatch(
      /data-testid="plumix-dev-overlay-label">Counter<\/span>/,
    );
    expect(html).toContain("<p>the error</p>");
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

    expect(html).toMatch(
      /Counter<\/span><span>nav<\/span><button[^>]*data-testid="plumix-dev-overlay-close"/,
    );
  });
});
