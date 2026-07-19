import { describe, expect, test } from "vitest";

import {
  injectDemoToolbar,
  renderDemoToolbar,
  shouldInjectDemoToolbar,
} from "./toolbar.js";

describe("renderDemoToolbar", () => {
  const html = renderDemoToolbar();

  test("offers reset and deploy actions", () => {
    expect(html).toContain('href="/_demo/reset"');
    expect(html).toContain("github.com/withplumix/plumix");
  });

  test("drives a countdown from the readable expiry cookie", () => {
    expect(html).toContain("plumix_demo_expires");
  });
});

describe("injectDemoToolbar", () => {
  test("inserts the toolbar before </body>", () => {
    const out = injectDemoToolbar("<html><body><p>hi</p></body></html>");
    expect(out).toContain("<p>hi</p>");
    expect(out).toContain("_demo/reset");
    expect(out.indexOf("_demo/reset")).toBeLessThan(out.indexOf("</body>"));
  });

  test("returns the document unchanged when there is no </body>", () => {
    const doc = "not html";
    expect(injectDemoToolbar(doc)).toBe(doc);
  });
});

describe("shouldInjectDemoToolbar", () => {
  const req = (path: string): Request =>
    new Request(`https://demo.example${path}`);

  test("shows the pill on a session-holder's public page", () => {
    expect(shouldInjectDemoToolbar(req("/posts/hello"), true)).toBe(true);
  });

  test("hides the pill for the anonymous showcase (no session)", () => {
    expect(shouldInjectDemoToolbar(req("/posts/hello"), false)).toBe(false);
  });

  test("hides the pill on the admin surface", () => {
    expect(shouldInjectDemoToolbar(req("/_plumix/admin"), true)).toBe(false);
  });

  // Regression: the editor canvas iframe loads the entry's *public* route with
  // `?plumix.edit` — not under `/_plumix/*` — so without this the fixed pill
  // floated inside the editing surface.
  test("hides the pill on the editor canvas render (?plumix.edit)", () => {
    expect(
      shouldInjectDemoToolbar(
        req("/posts/hello?preview=tok&plumix.edit"),
        true,
      ),
    ).toBe(false);
    expect(
      shouldInjectDemoToolbar(req("/posts/hello?plumix.edit="), true),
    ).toBe(false);
  });
});
