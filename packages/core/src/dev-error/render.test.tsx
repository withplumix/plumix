import { describe, expect, test } from "vitest";

import { renderDevErrorPage } from "./render.js";

describe("renderDevErrorPage", () => {
  test("emits a standalone HTML document with the exception name and message", () => {
    const err = new TypeError("cannot read properties of undefined");
    const html = renderDevErrorPage(err);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("TypeError");
    expect(html).toContain("cannot read properties of undefined");
  });

  test("resolves the stack to frames at their original file:line", () => {
    const err = new Error("boom");
    err.stack = [
      "Error: boom",
      "    at render (/proj/src/theme.tsx:12:7)",
      "    at renderToString (/proj/node_modules/react-dom/server.js:100:5)",
    ].join("\n");
    const html = renderDevErrorPage(err);

    expect(html).toContain('data-testid="plumix-dev-error-frame"');
    expect(html).toContain('data-file="/proj/src/theme.tsx"');
    // Shown relative to the project root the frames imply (`/proj/`).
    expect(html).toContain("src/theme.tsx:12");
    // The vendor frame is collapsed behind the toggle.
    expect(html).toContain('data-testid="plumix-dev-error-vendor"');
  });

  test("inlines the client enhancement only when there are frames to enhance", () => {
    const withFrames = new Error("boom");
    withFrames.stack = "Error: boom\n    at render (/proj/src/theme.tsx:12:7)";
    // `__excerpt` markup is produced only by the inlined enhancement, never by
    // the server-rendered baseline — a reliable marker that the script shipped.
    expect(renderDevErrorPage(withFrames)).toContain("__excerpt");

    const noFrames = new Error("boom");
    noFrames.stack = "Error: boom";
    const html = renderDevErrorPage(noFrames);
    expect(html).not.toContain("<script>");
    // Falls back to the raw stack view.
    expect(html).toContain("plumix-dev-error__stack");
  });

  test("the inlined enhancement is self-contained and can't break out of the script tag", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at render (/proj/src/theme.tsx:12:7)";
    const script = /<script>([\s\S]*?)<\/script>/.exec(renderDevErrorPage(err));
    const body = script?.[1] ?? "";

    expect(body.length).toBeGreaterThan(0);
    // No `</script` sequence would prematurely close the inlined tag.
    expect(body.toLowerCase()).not.toContain("</script");
    // Stringifying the function must not pull in downleveling helpers, which
    // would be undefined bindings once inlined (blocks targets native async).
    for (const helper of ["__awaiter", "__generator", "__spread", "__values"]) {
      expect(body).not.toContain(helper);
    }
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
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  test("escapes HTML in the exception message so it can't break out of the page", () => {
    const err = new Error("<script>alert(1)</script>");
    err.stack = "Error\n    at x (/proj/src/a.ts:1:1)";
    const html = renderDevErrorPage(err);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
