import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { fileBlock } from "./index.js";

describe("media/file v2", () => {
  test("renders as download anchor with filename + size + mime label", () => {
    const html = renderBlockSpecToHtml(fileBlock, {
      href: "/_plumix/media/abc/report.pdf",
      filename: "report.pdf",
      size: 2_048_576,
      mime: "application/pdf",
    });
    expect(html).toContain('href="/_plumix/media/abc/report.pdf"');
    expect(html).toContain('download="report.pdf"');
    expect(html).toContain("report.pdf");
    expect(html).toContain("2.0 MB");
    expect(html).toContain("application/pdf");
  });

  test("strips dangerous javascript: hrefs", () => {
    const html = renderBlockSpecToHtml(fileBlock, {
      href: "javascript:alert(1)",
      filename: "x",
    });
    expect(html).not.toContain("javascript:");
  });

  test("accepts mailto: and tel: hrefs (contact-card flows)", () => {
    const mailtoHtml = renderBlockSpecToHtml(fileBlock, {
      href: "mailto:author@example.com",
      filename: "Contact",
    });
    const telHtml = renderBlockSpecToHtml(fileBlock, {
      href: "tel:+15551234",
      filename: "Phone",
    });
    expect(mailtoHtml).toContain('href="mailto:author@example.com"');
    expect(telHtml).toContain('href="tel:+15551234"');
  });

  test("falls back to 'Download' label when filename is absent", () => {
    const html = renderBlockSpecToHtml(fileBlock, {
      href: "/_plumix/media/x/y.zip",
    });
    expect(html).toContain("Download");
  });

  test("prefers the picked media snapshot over the raw fields", () => {
    const html = renderBlockSpecToHtml(fileBlock, {
      media: {
        url: "/_plumix/media/z/report.pdf",
        filename: "report.pdf",
        mime: "application/pdf",
      },
      href: "",
    });
    expect(html).toContain('href="/_plumix/media/z/report.pdf"');
    expect(html).toContain("report.pdf");
    expect(html).toContain("application/pdf");
  });

  test("offers a media picker and drops the dead mediaId + thumbnail inputs", () => {
    const names = fileBlock.inputs?.map((i) => i.name) ?? [];
    expect(names).toContain("media");
    expect(names).not.toContain("mediaId");
    expect(names).not.toContain("thumbnail");
  });

  test("shows no '0 B' for an unset size", () => {
    const html = renderBlockSpecToHtml(fileBlock, {
      href: "/x/y.zip",
      filename: "y.zip",
      size: 0,
    });
    expect(html).not.toContain("0 B");
  });

  test("empty file renders nothing on the page but a placeholder in the editor", () => {
    expect(renderBlockSpecToHtml(fileBlock, { href: "" })).not.toContain("<a");
    const editing = renderBlockSpecToHtml(
      fileBlock,
      { href: "" },
      { editing: true },
    );
    expect(editing).toContain("data-plumix-file-placeholder");
  });
});
