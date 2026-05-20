import type { Data } from "@puckeditor/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ThemeTokens } from "@plumix/blocks";
import {
  createBlockRegistry,
  headingBlock,
  renderBlockTree,
} from "@plumix/blocks";

import { puckDataToBlockTree } from "./puck-to-block-tree.js";

const tokens: ThemeTokens = {
  spacing: {
    sm: { value: "0.5rem", label: "Small" },
    lg: { value: "2rem", label: "Large" },
  },
};

const registry = createBlockRegistry([headingBlock]);

describe("style cascade (Puck data → walker → public CSS)", () => {
  test("emits the desktop rule followed by the mobile @media rule for a multi-bucket style edit", () => {
    const puckData: Data = {
      content: [
        {
          type: "core/heading",
          props: {
            id: "h1",
            text: "Hello",
            level: 2,
            style: {
              large: { padding: "lg" },
              small: { padding: "sm" },
            },
          },
        },
      ] as Data["content"],
      root: { props: {} },
    };

    const html = renderToStaticMarkup(
      renderBlockTree(puckDataToBlockTree(puckData), registry, { tokens }),
    );

    const desktopRule =
      ".plumix-block-h1 { padding: var(--plumix-spacing-lg, 2rem); }";
    const mobileRule =
      "@media (max-width: 640px) { .plumix-block-h1 { padding: var(--plumix-spacing-sm, 0.5rem); } }";

    expect(html).toContain(`${desktopRule} ${mobileRule}`);
  });
});
