import { afterEach, describe, expect, test } from "vitest";

import { renderDevErrorPage } from "./render.js";

function withStack(message: string): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}\n    at render (/proj/src/theme.tsx:12:7)`;
  return err;
}

describe("renderDevErrorPage", () => {
  afterEach(() => {
    delete process.env.PLUMIX_EDITOR;
    delete process.env.PLUMIX_EDITOR_PATH_MAP;
  });

  test("links each frame to VS Code by default (PLUMIX_EDITOR unset)", () => {
    delete process.env.PLUMIX_EDITOR;
    const html = renderDevErrorPage(withStack("boom"));

    expect(html).toContain('data-testid="plumix-dev-error-open"');
    expect(html).toContain('href="vscode://file//proj/src/theme.tsx:12:7"');
  });

  test("honors the PLUMIX_EDITOR known-editor key", () => {
    process.env.PLUMIX_EDITOR = "cursor";
    const html = renderDevErrorPage(withStack("boom"));

    expect(html).toContain('href="cursor://file//proj/src/theme.tsx:12:7"');
  });

  test("honors a custom PLUMIX_EDITOR {file}/{line} format string", () => {
    process.env.PLUMIX_EDITOR = "myeditor://open?path={file}&line={line}";
    const html = renderDevErrorPage(withStack("boom"));

    expect(html).toContain(
      'href="myeditor://open?path=/proj/src/theme.tsx&amp;line=12"',
    );
  });

  test("remaps the frame path via PLUMIX_EDITOR_PATH_MAP for a container dev server", () => {
    process.env.PLUMIX_EDITOR_PATH_MAP = "/proj=>/Users/me/proj";
    const html = renderDevErrorPage(withStack("boom"));

    expect(html).toContain(
      'href="vscode://file//Users/me/proj/src/theme.tsx:12:7"',
    );
  });

  test("renders no open-in-editor link when PLUMIX_EDITOR is off", () => {
    process.env.PLUMIX_EDITOR = "off";
    const html = renderDevErrorPage(withStack("boom"));

    expect(html).not.toContain('data-testid="plumix-dev-error-open"');
    // The frame itself still renders — only the editor link is dropped.
    expect(html).toContain('data-testid="plumix-dev-error-frame"');
  });

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
    const html = renderDevErrorPage(err);

    expect(html).toContain("<script>");
    // Exactly one closing tag: an inlined `</script>` would break the page out
    // of its own script element, and would split this into three parts.
    expect(html.toLowerCase().split("</script>")).toHaveLength(2);
    // Stringifying the function must not pull in downleveling helpers, which
    // would be undefined bindings once inlined (blocks targets native async).
    for (const helper of ["__awaiter", "__generator", "__spread", "__values"]) {
      expect(html).not.toContain(helper);
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

  test("renders a how-to-fix card for each hint passed in", () => {
    const html = renderDevErrorPage(new Error("no such table: posts"), [
      { title: "Run your migrations", body: "Run `plumix migrate`." },
    ]);

    expect(html).toContain('data-testid="plumix-dev-error-hints"');
    expect(html).toContain("Run your migrations");
    expect(html).toContain("Run `plumix migrate`.");
  });

  test("renders no hint card when no hints are passed", () => {
    const html = renderDevErrorPage(new Error("boom"));

    expect(html).not.toContain('data-testid="plumix-dev-error-hints"');
  });

  test("renders each contributed panel's isolated HTML as a section", () => {
    const html = renderDevErrorPage(new Error("boom"), [], undefined, [
      { id: "queue", title: "Queue", html: "<p>3 jobs pending</p>" },
    ]);

    expect(html).toContain('data-testid="plumix-dev-error-panel-queue"');
    expect(html).toContain("Queue");
    expect(html).toContain("<p>3 jobs pending</p>");
  });

  test("renders no panels block when none are passed", () => {
    const html = renderDevErrorPage(new Error("boom"));

    expect(html).not.toContain('data-testid="plumix-dev-error-panels"');
  });

  test("escapes HTML in a hint so a matched message can't break out of the page", () => {
    const html = renderDevErrorPage(new Error("boom"), [
      { title: "<script>alert(1)</script>" },
    ]);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("escapes HTML in the exception message so it can't break out of the page", () => {
    const err = new Error("<script>alert(1)</script>");
    err.stack = "Error\n    at x (/proj/src/a.ts:1:1)";
    const html = renderDevErrorPage(err);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
