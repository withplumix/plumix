import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ClientErrorBody } from "./island-overlay.js";

describe("ClientErrorBody", () => {
  test("shows the error and its diff with no server-only context sections", () => {
    const html = renderToStaticMarkup(
      <ClientErrorBody
        entry={{
          label: "<Clock>",
          info: {
            name: "Hydration mismatch",
            message: "The renders disagreed.",
            componentStack: "\n    at Clock",
            hydrationDiff: {
              server: "<span>SERVER</span>",
              client: "<span>CLIENT</span>",
            },
          },
        }}
        shadowRoot={null}
      />,
    );

    expect(html).toContain('data-testid="plumix-dev-error-message"');
    expect(html).toContain('data-testid="plumix-dev-error-hydration-diff"');
    expect(html).not.toMatch(
      /data-testid="plumix-dev-error-(request|route|database|timeline|app|panels)"/,
    );
  });
});
