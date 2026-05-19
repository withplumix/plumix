import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { spacerBlockV2 } from "./v2.js";

describe("core/spacer v2", () => {
  test("renders an aria-hidden div with the default 24px height", () => {
    const html = renderBlockSpecToHtml(spacerBlockV2, {});

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('height:24px');
  });

  test("renders the declared positive height", () => {
    const html = renderBlockSpecToHtml(spacerBlockV2, { height: 64 });

    expect(html).toContain('height:64px');
  });

  test("falls back to the default for negative or zero height", () => {
    expect(renderBlockSpecToHtml(spacerBlockV2, { height: 0 })).toContain('height:24px');
    expect(renderBlockSpecToHtml(spacerBlockV2, { height: -10 })).toContain('height:24px');
  });
});
