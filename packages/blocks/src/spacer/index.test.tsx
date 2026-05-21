import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { spacerBlock } from "./index.js";

describe("core/spacer", () => {
  test("renders an aria-hidden div with the default 24px height", () => {
    const html = renderBlockSpecToHtml(spacerBlock, {});

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("height:24px");
  });

  test("renders the declared positive height", () => {
    const html = renderBlockSpecToHtml(spacerBlock, { height: 64 });

    expect(html).toContain("height:64px");
  });

  test("falls back to the default for negative or zero height", () => {
    expect(renderBlockSpecToHtml(spacerBlock, { height: 0 })).toContain(
      "height:24px",
    );
    expect(renderBlockSpecToHtml(spacerBlock, { height: -10 })).toContain(
      "height:24px",
    );
  });
});
