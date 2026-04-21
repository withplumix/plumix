import { describe, expect, test } from "vitest";

import { renderDefaultDocument } from "./document.js";

describe("renderDefaultDocument", () => {
  test("renders a doctyped html document with the escaped title in <title>", () => {
    const html = renderDefaultDocument({
      title: "Hello & goodbye",
      bodyHtml: "<p>hi</p>",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Hello &amp; goodbye</title>");
    expect(html).toContain("<body><p>hi</p></body>");
  });

  test("passes bodyHtml through without re-escaping (caller's responsibility)", () => {
    const html = renderDefaultDocument({
      title: "t",
      bodyHtml: "<article>keep me</article>",
    });
    expect(html).toContain("<article>keep me</article>");
  });
});
