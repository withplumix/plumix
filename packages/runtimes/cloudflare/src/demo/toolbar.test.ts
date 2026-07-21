import { describe, expect, test } from "vitest";

import {
  injectDemoToolbar,
  renderDemoToolbar,
  shouldInjectDemoToolbar,
} from "./toolbar.js";

describe("renderDemoToolbar", () => {
  describe("session holder", () => {
    const html = renderDemoToolbar(true);

    test("offers reset and deploy actions", () => {
      expect(html).toContain('href="/_demo/reset"');
      expect(html).toContain("github.com/withplumix/plumix");
    });

    test("drives a countdown from the readable expiry cookie", () => {
      expect(html).toContain("plumix_demo_expires");
    });

    test("does not offer the anonymous try-editor CTA", () => {
      expect(html).not.toContain('data-testid="try-editor"');
    });
  });

  describe("anonymous visitor", () => {
    const html = renderDemoToolbar(false);

    test("offers the try-editor CTA into /demo", () => {
      expect(html).toContain('data-testid="try-editor"');
      expect(html).toContain('href="/demo"');
    });

    test("omits reset and the countdown (no session yet)", () => {
      expect(html).not.toContain("/_demo/reset");
      expect(html).not.toContain("plumix_demo_expires");
    });
  });
});

describe("injectDemoToolbar", () => {
  test("inserts the session pill before </body>", () => {
    const out = injectDemoToolbar("<html><body><p>hi</p></body></html>", true);
    expect(out).toContain("<p>hi</p>");
    expect(out).toContain("_demo/reset");
    expect(out.indexOf("_demo/reset")).toBeLessThan(out.indexOf("</body>"));
  });

  test("inserts the anonymous CTA pill before </body>", () => {
    const out = injectDemoToolbar("<html><body><p>hi</p></body></html>", false);
    expect(out).toContain('data-testid="try-editor"');
    expect(out.indexOf("try-editor")).toBeLessThan(out.indexOf("</body>"));
  });

  test("returns the document unchanged when there is no </body>", () => {
    const doc = "not html";
    expect(injectDemoToolbar(doc, true)).toBe(doc);
  });
});

describe("shouldInjectDemoToolbar", () => {
  const req = (path: string): Request =>
    new Request(`https://demo.example${path}`);

  test("shows the pill on a session-holder's public page", () => {
    expect(shouldInjectDemoToolbar(req("/posts/hello"))).toBe(true);
  });

  // The anonymous showcase now carries the "Try the editor" CTA in the pill
  // (it used to live in the theme header), so it's injected there too.
  test("shows the pill on the anonymous showcase", () => {
    expect(shouldInjectDemoToolbar(req("/posts/hello"))).toBe(true);
  });

  test("hides the pill on the admin surface", () => {
    expect(shouldInjectDemoToolbar(req("/_plumix/admin"))).toBe(false);
  });

  // Regression: the editor canvas iframe loads the entry's *public* route with
  // `?plumix.edit` — not under `/_plumix/*` — so without this the fixed pill
  // floated inside the editing surface.
  test("hides the pill on the editor canvas render (?plumix.edit)", () => {
    expect(
      shouldInjectDemoToolbar(req("/posts/hello?preview=tok&plumix.edit")),
    ).toBe(false);
    expect(shouldInjectDemoToolbar(req("/posts/hello?plumix.edit="))).toBe(
      false,
    );
  });
});
