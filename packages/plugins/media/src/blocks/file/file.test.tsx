import { mockRegistry, renderBlock } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { fileBlock } from "./index.js";

describe("media/file", () => {
  test("renders as download anchor with filename + size + mime label", async () => {
    const registry = await mockRegistry({ core: [fileBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/file",
            attrs: {
              href: "/_plumix/media/abc/report.pdf",
              filename: "report.pdf",
              size: 2_048_576,
              mime: "application/pdf",
            },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-plumix-block="media/file"');
    expect(html).toContain('href="/_plumix/media/abc/report.pdf"');
    expect(html).toContain('download="report.pdf"');
    expect(html).toContain("report.pdf");
    expect(html).toContain("2.0 MB");
    expect(html).toContain("application/pdf");
  });

  test("accepts mailto: and tel: hrefs (contact-card flows)", async () => {
    const registry = await mockRegistry({ core: [fileBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/file",
            attrs: { href: "mailto:author@example.com", filename: "Contact" },
            content: [],
          },
          {
            type: "media/file",
            attrs: { href: "tel:+15551234", filename: "Phone" },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('href="mailto:author@example.com"');
    expect(html).toContain('href="tel:+15551234"');
  });

  test("strips dangerous hrefs (javascript:) rather than leaking them", async () => {
    const registry = await mockRegistry({ core: [fileBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/file",
            attrs: { href: "javascript:alert(1)", filename: "x" },
            content: [],
          },
        ],
      },
    });
    expect(html).not.toContain("javascript:");
  });
});
