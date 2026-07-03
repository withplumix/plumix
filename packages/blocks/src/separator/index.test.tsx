import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { separatorBlock } from "./index.js";

describe("core/separator", () => {
  test("renders an <hr> with the solid variant by default", () => {
    const html = renderBlockSpecToHtml(separatorBlock, {});

    expect(html).toBe('<div><hr data-variant="solid"/></div>');
  });

  test("renders the declared variant when valid", () => {
    const html = renderBlockSpecToHtml(separatorBlock, {
      variant: "dashed",
    });

    expect(html).toContain('data-variant="dashed"');
  });

  test("falls back to solid for an unknown variant", () => {
    const html = renderBlockSpecToHtml(separatorBlock, {
      variant: "wavy",
    });

    expect(html).toContain('data-variant="solid"');
  });
});
