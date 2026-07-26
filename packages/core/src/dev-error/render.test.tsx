import { describe, expect, test } from "vitest";

import { renderDevErrorPage } from "./render.js";

describe("renderDevErrorPage", () => {
  test("emits a standalone HTML document with the exception name, message, and stack", () => {
    const err = new TypeError("cannot read properties of undefined");
    err.stack =
      "TypeError: cannot read properties of undefined\n    at render (theme.tsx:12:7)";
    const html = renderDevErrorPage(err);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("TypeError");
    expect(html).toContain("cannot read properties of undefined");
    // The raw stack frame is present.
    expect(html).toContain("at render (theme.tsx:12:7)");
  });

  test("inlines the shared token sheet so the page needs no theme or stylesheet", () => {
    const html = renderDevErrorPage(new Error("boom"));

    expect(html).toContain("<style>");
    expect(html).toContain(".plumix-dev-error");
  });

  test("resets the document body so the full-height root doesn't overflow into a scroll", () => {
    const html = renderDevErrorPage(new Error("boom"));

    expect(html).toContain("html,body{margin:0}");
  });

  test("normalizes a non-Error throw into a named exception", () => {
    const html = renderDevErrorPage("just a string");

    expect(html).toContain("just a string");
    // Renders a document rather than throwing on the odd shape.
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  test("escapes HTML in the exception message so it can't break out of the page", () => {
    const html = renderDevErrorPage(new Error("<script>alert(1)</script>"));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
