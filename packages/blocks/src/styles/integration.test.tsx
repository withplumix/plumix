import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { BlockContext, TiptapNode as TiptapNodeJson } from "../types.js";
import { coreBlocks } from "../core-blocks.js";
import { mergeBlockRegistry } from "../registry.js";
import { defaultMarkRegistry } from "../test/index.js";
import { EntryContent } from "../walker.js";

const ROOT_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

describe("blocks + supports + tokens end-to-end", () => {
  test("paragraph with attrs.style.color.background='primary' renders has-primary-background-color under a theme declaring the token", async () => {
    const registry = await mergeBlockRegistry({
      core: coreBlocks,
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          attrs: { style: { color: { background: "primary" } } },
          content: [{ type: "text", text: "themed" }],
        },
      ],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
        themeTokens={{
          colors: { primary: { value: "#0066cc", label: "Primary" } },
        }}
      />,
    );
    const p = container.querySelector("p");
    expect(p?.className).toBe("has-primary-background-color");
    expect(p?.textContent).toBe("themed");
  });

  // heading anchor test removed — core/heading migrated to new BlockNode shape
  // in slice #381; anchor support still covered by per-block supports unit tests.
});
