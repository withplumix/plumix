import { describe, expect, test } from "vitest";

import { injectDemoToolbar, renderDemoToolbar } from "./toolbar.js";

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
