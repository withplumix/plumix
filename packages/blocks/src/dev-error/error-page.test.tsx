import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { DevErrorFrame } from "./contract.js";
import { DEV_ERROR_SOURCE_ENDPOINT } from "./frames.js";
import { DevErrorPage } from "./index.js";

const appFrame: DevErrorFrame = {
  functionName: "render",
  file: "/proj/src/theme.tsx",
  line: 12,
  column: 7,
  isVendor: false,
};
const vendorFrame: DevErrorFrame = {
  functionName: "renderToString",
  file: "/proj/node_modules/react-dom/server.js",
  line: 100,
  column: 5,
  isVendor: true,
};

describe("DevErrorPage", () => {
  test("renders the exception name and message", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage error={{ name: "TypeError", message: "boom" }} />,
    );

    expect(html).toContain("TypeError");
    expect(html).toContain("boom");
  });

  test("falls back to the raw stack when no frames were parsed", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "Error",
          message: "boom",
          stack: "Error: boom\n    at render (theme.tsx:12:7)",
        }}
      />,
    );

    expect(html).toContain("plumix-dev-error__stack");
    expect(html).toContain("theme.tsx:12:7");
  });

  test("renders each frame as a button carrying its absolute file and line", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{ name: "TypeError", message: "boom", frames: [appFrame] }}
      />,
    );

    expect(html).toContain('data-testid="plumix-dev-error-frame"');
    // The data attribute keeps the absolute path — the resolver reads it.
    expect(html).toContain('data-file="/proj/src/theme.tsx"');
    expect(html).toContain('data-line="12"');
    expect(html).toContain("render");
  });

  test("shows frame locations relative to the project root", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "TypeError",
          message: "boom",
          frames: [appFrame, vendorFrame],
        }}
      />,
    );

    // The common base (`/proj/`) is stripped from the shown location.
    expect(html).toContain("src/theme.tsx:12");
    expect(html).not.toContain(">/proj/src/theme.tsx:12<");
    expect(html).toContain('data-base="/proj/"');
  });

  test("collapses vendor frames behind a closed details toggle, app frames stay out", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "TypeError",
          message: "boom",
          frames: [appFrame, vendorFrame],
        }}
      />,
    );

    // A details element that is not `open` — collapsed by default, revealable.
    expect(html).toContain('data-testid="plumix-dev-error-vendor"');
    expect(html).toMatch(/<details(?![^>]*\bopen\b)/);
    // The app frame renders before the vendor <details>.
    const appAt = html.indexOf("/proj/src/theme.tsx");
    const detailsAt = html.indexOf("<details");
    expect(appAt).toBeGreaterThanOrEqual(0);
    expect(appAt).toBeLessThan(detailsAt);
    // The vendor frame lives inside the details, after the summary.
    expect(html).toContain("react-dom/server.js");
    expect(html.indexOf("react-dom/server.js")).toBeGreaterThan(detailsAt);
  });

  test("exposes the source-resolver endpoint and an excerpt panel for the enhancement", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{ name: "TypeError", message: "boom", frames: [appFrame] }}
      />,
    );

    expect(html).toContain(`data-endpoint="${DEV_ERROR_SOURCE_ENDPOINT}"`);
    expect(html).toContain('data-testid="plumix-dev-error-source"');
  });

  test("renders without app frames when the whole stack is vendor", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{ name: "Error", message: "boom", frames: [vendorFrame] }}
      />,
    );

    expect(html).toContain('data-testid="plumix-dev-error-vendor"');
    expect(html).toContain("react-dom/server.js");
  });

  test("renders a how-to-fix card for each contributed hint, above the stack", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "ThemeRegistrationError",
          message: "boom",
          frames: [appFrame],
          hints: [
            {
              title: "Register a theme",
              body: "Every app renders through a theme.",
              docs: [
                { label: "Themes guide", href: "https://example.test/themes" },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-testid="plumix-dev-error-hints"');
    expect(html).toContain('data-testid="plumix-dev-error-hint"');
    expect(html).toContain("Register a theme");
    expect(html).toContain("Every app renders through a theme.");
    expect(html).toContain('href="https://example.test/themes"');
    expect(html).toContain("Themes guide");
    // The card sits above the stack/frames so the fix reads first.
    expect(html.indexOf("Register a theme")).toBeLessThan(
      html.indexOf('data-testid="plumix-dev-error-frames"'),
    );
  });

  test("renders a hint with only a title — body and docs are optional", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "Error",
          message: "boom",
          hints: [{ title: "Run your migrations" }],
        }}
      />,
    );

    expect(html).toContain('data-testid="plumix-dev-error-hint"');
    expect(html).toContain("Run your migrations");
  });

  test("renders no how-to-fix card when there are no hints", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage error={{ name: "TypeError", message: "boom" }} />,
    );

    expect(html).not.toContain('data-testid="plumix-dev-error-hints"');
  });
});
