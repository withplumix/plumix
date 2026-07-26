import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DevErrorPage } from "./index.js";

describe("DevErrorPage", () => {
  test("renders the exception name, message, and raw stack", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage
        error={{
          name: "TypeError",
          message: "cannot read properties of undefined",
          stack:
            "TypeError: cannot read properties of undefined\n    at render (theme.tsx:12:7)",
        }}
      />,
    );

    expect(html).toContain("TypeError");
    expect(html).toContain("cannot read properties of undefined");
    expect(html).toContain("theme.tsx:12:7");
  });

  test("renders without a stack, showing a placeholder", () => {
    const html = renderToStaticMarkup(
      <DevErrorPage error={{ name: "Error", message: "boom" }} />,
    );

    expect(html).toContain("boom");
    // No stack throws no error and still produces the stack region.
    expect(html).toContain("plumix-dev-error__stack");
  });
});
