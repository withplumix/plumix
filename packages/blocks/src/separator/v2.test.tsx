import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { separatorBlockV2 } from "./v2.js";

describe("core/separator v2", () => {
  test("renders an <hr> with the solid variant by default", () => {
    const html = renderBlockSpecToHtml(separatorBlockV2, {});

    expect(html).toBe(
      '<div data-plumix-block="core/separator"><hr data-variant="solid"/></div>',
    );
  });

  test("renders the declared variant when valid", () => {
    const html = renderBlockSpecToHtml(separatorBlockV2, {
      variant: "dashed",
    });

    expect(html).toContain('data-variant="dashed"');
  });

  test("falls back to solid for an unknown variant", () => {
    const html = renderBlockSpecToHtml(separatorBlockV2, {
      variant: "wavy",
    });

    expect(html).toContain('data-variant="solid"');
  });
});
