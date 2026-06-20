import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { EntryContent } from "../entry-content.js";
import { createBlockRegistry } from "../block-registry.js";
import { headingBlock } from "../heading/index.js";
import { BlockRenderer, PlumixProvider } from "./index.js";

const registry = createBlockRegistry([headingBlock]);
const content: EntryContent = {
  version: "plumix.v2",
  blocks: [{ id: "h1", name: "core/heading", attrs: { text: "Hi", level: 2 } }],
};

describe("BlockRenderer edit-mode hydration boundary", () => {
  test("wraps content in a mount root and embeds the initial tree", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry, mode: "edit" }}>
        <BlockRenderer content={content} />
      </PlumixProvider>,
    );

    expect(html).toContain("data-plumix-content-root");
    expect(html).toContain("data-plumix-initial-tree");
    // The serialized tree is embedded so the runtime can seed without a round-trip.
    expect(html).toContain("plumix.v2");
    expect(html).toContain("Hi"); // still renders the content for first paint
  });

  test("live render has no editor mount root or embedded tree", () => {
    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry }}>
        <BlockRenderer content={content} />
      </PlumixProvider>,
    );

    expect(html).not.toContain("data-plumix-content-root");
    expect(html).not.toContain("data-plumix-initial-tree");
  });
});
