import type { ComponentData, Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import { buildCopyPatternSource } from "./build-copy-pattern-source.js";

const data: Pick<Data, "content"> = {
  content: [
    { type: "core/heading", props: { id: "h1", text: "Title", level: 2 } },
    { type: "core/rich-text", props: { id: "p1", html: "<p>Body</p>" } },
  ] as Data["content"],
};

describe("buildCopyPatternSource", () => {
  test("serializes the whole document when no item is selected", () => {
    const source = buildCopyPatternSource({
      title: "My Hero",
      data,
      selectedItem: null,
    });
    expect(source).toContain('name: "starter/my-hero"');
    expect(source).toContain('title: "My Hero"');
    expect(source).toContain('block("core/heading"');
    expect(source).toContain('block("core/rich-text"');
  });

  test("serializes only the selected subtree when one is selected", () => {
    const selectedItem = data.content[0] as ComponentData;
    const source = buildCopyPatternSource({
      title: "Heading",
      data,
      selectedItem,
    });
    expect(source).toContain('block("core/heading"');
    expect(source).not.toContain('block("core/rich-text"');
  });

  test("substitutes a placeholder title when the entry is untitled", () => {
    const source = buildCopyPatternSource({
      title: "",
      data,
      selectedItem: null,
    });
    expect(source).toContain('name: "starter/untitled"');
    expect(source).toContain('title: "Untitled"');
  });
});
