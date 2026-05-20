import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { buttonBlockV2 } from "../button/v2.js";
import { buttonsBlockV2 } from "./v2.js";

describe("core/buttons v2", () => {
  test("renders empty <div data-align='start'> by default (v1 parity)", () => {
    const html = renderBlockSpecToHtml(buttonsBlockV2, {});

    expect(html).toBe(
      '<div data-plumix-block="core/buttons"><div data-align="start"></div></div>',
    );
  });

  test("renders align + gap when valid", () => {
    const html = renderBlockSpecToHtml(buttonsBlockV2, {
      align: "center",
      gap: "16px",
    });

    expect(html).toContain('data-align="center"');
    expect(html).toContain('data-gap="16px"');
  });

  test("coerces a positive number gap to px", () => {
    const html = renderBlockSpecToHtml(buttonsBlockV2, { gap: 24 });

    expect(html).toContain('data-gap="24px"');
  });

  test("falls back to align='start' for invalid align; ignores invalid gap", () => {
    const html = renderBlockSpecToHtml(buttonsBlockV2, {
      align: "wibble",
      gap: 0,
    });

    expect(html).toContain('data-align="start"');
    expect(html).not.toContain("data-gap");
  });

  test("accepts non-px string gap values verbatim (1rem, calc(), etc.)", () => {
    expect(renderBlockSpecToHtml(buttonsBlockV2, { gap: "1rem" })).toContain(
      'data-gap="1rem"',
    );
    expect(
      renderBlockSpecToHtml(buttonsBlockV2, { gap: "calc(1rem + 4px)" }),
    ).toContain('data-gap="calc(1rem + 4px)"');
  });

  test("renders nested button children via the items slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "btns",
        name: "core/buttons",
        attrs: {
          align: "end",
          items: [
            { id: "b1", name: "core/button", attrs: { label: "Save" } },
            { id: "b2", name: "core/button", attrs: { label: "Cancel" } },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [buttonsBlockV2, buttonBlockV2],
      tree,
    );

    expect(html).toContain('data-align="end"');
    expect(html).toContain("Save");
    expect(html).toContain("Cancel");
  });
});
