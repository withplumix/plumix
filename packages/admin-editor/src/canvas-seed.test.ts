import { describe, expect, test } from "vitest";

import { parseCanvasSeed } from "./canvas-seed.js";

const blocks = [
  { id: "e1", name: "core/rich-text", attrs: { body: "<h2>Embedded</h2>" } },
];
const initialTree = JSON.stringify({ version: "plumix.v2", blocks });

describe("parseCanvasSeed", () => {
  test("seeds the canvas from the embedded tree", () => {
    const seed = parseCanvasSeed({
      initialTree,
      renderEnv: "",
      loaderData: "",
    });

    expect(seed.initialTree).toEqual(blocks);
  });

  test("seeds the render env the page embedded", () => {
    const seed = parseCanvasSeed({
      initialTree,
      renderEnv: JSON.stringify({
        locale: "de",
        tokens: { colors: { brand: { value: "#0000ff" } } },
      }),
      loaderData: "",
    });

    expect(seed).toEqual({
      initialTree: blocks,
      initialLoaderData: new Map(),
      locale: "de",
      tokens: { colors: { brand: { value: "#0000ff" } } },
    });
  });

  test.each([
    ["malformed JSON", "{"],
    ["fields of the wrong kind", '{"locale":7,"entry":"x","tokens":[]}'],
    ["a non-object", "null"],
  ])("a render env with %s still seeds the tree", (_, renderEnv) => {
    const seed = parseCanvasSeed({ initialTree, renderEnv, loaderData: "" });

    expect(seed).toEqual({ initialTree: blocks, initialLoaderData: new Map() });
  });
});
