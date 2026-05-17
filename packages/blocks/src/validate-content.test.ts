import { describe, expect, test } from "vitest";

import type { BlockRegistry, MarkRegistry } from "./index.js";
import {
  coreBlocks,
  coreMarks,
  mergeBlockRegistry,
  mergeMarkRegistry,
} from "./index.js";
import { validateBlockContent } from "./validate-content.js";

const registriesPromise = (async () => ({
  blocks: await mergeBlockRegistry({
    core: coreBlocks,
    plugins: [],
    themeOverrides: {},
    themeId: null,
  }),
  marks: await mergeMarkRegistry({
    core: coreMarks,
    plugins: [],
    themeOverrides: {},
    themeId: null,
  }),
}))();

async function getRegistries(): Promise<{
  readonly blocks: BlockRegistry;
  readonly marks: MarkRegistry;
}> {
  return registriesPromise;
}

describe("validateBlockContent — happy path", () => {
  test("accepts a minimal paragraph doc", async () => {
    const r = await getRegistries();
    const result = validateBlockContent(
      {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [{ type: "text", text: "hi" }],
          },
        ],
      },
      r,
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateBlockContent — unknown_mark", () => {
  test("rejects a text leaf carrying an unknown mark type", async () => {
    const r = await getRegistries();
    const result = validateBlockContent(
      {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [
              {
                type: "text",
                text: "hi",
                marks: [{ type: "blink-tag-from-the-90s" }],
              },
            ],
          },
        ],
      },
      r,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors[0]?.code).toBe("unknown_mark");
    expect(result.errors[0]?.markName).toBe("blink-tag-from-the-90s");
    expect(result.errors[0]?.path).toContain(".marks[0]");
  });

  test("accepts text with marks present in the registry", async () => {
    const r = await getRegistries();
    const result = validateBlockContent(
      {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [
              {
                type: "text",
                text: "hi",
                marks: [{ type: "bold" }, { type: "italic" }],
              },
            ],
          },
        ],
      },
      r,
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateBlockContent — unknown_block_type", () => {
  test("rejects an unknown block name with a path pointing at the offender", async () => {
    const r = await getRegistries();
    const result = validateBlockContent(
      {
        type: "doc",
        content: [
          {
            type: "core/quote",
            content: [
              {
                type: "core/paragraph",
                content: [{ type: "text", text: "ok" }],
              },
              { type: "made-up/block", content: [] },
            ],
          },
        ],
      },
      r,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("unknown_block_type");
    expect(result.errors[0]?.path).toBe("content[0].content[1]");
    expect(result.errors[0]?.nodeName).toBe("made-up/block");
  });
});
