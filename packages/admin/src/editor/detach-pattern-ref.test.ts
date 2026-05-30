import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import { createPatternRegistry, definePattern } from "@plumix/blocks";

import { detachPatternRef } from "./detach-pattern-ref.js";

const refNode = (id: string, slug: string) => ({
  type: "core/pattern-ref",
  props: { id, slug },
});

const otherNode = (id: string, text: string) => ({
  type: "core/p",
  props: { id, text },
});

const heroPattern = definePattern({
  name: "starter/hero",
  title: "Hero",
  content: [
    { id: "h-1", name: "core/heading", attrs: { level: 1, text: "Hero" } },
    { id: "h-2", name: "core/paragraph", attrs: { text: "Lead" } },
  ],
});

describe("detachPatternRef", () => {
  const patterns = createPatternRegistry([heroPattern]);

  test("replaces the ref node at the selected index with the resolved body", () => {
    const data: Data = {
      content: [
        otherNode("a", "before"),
        refNode("ref-1", "starter/hero"),
        otherNode("b", "after"),
      ],
      root: {},
    };

    const next = detachPatternRef(data, 1, patterns);

    expect(next.content.map((c) => c.type)).toEqual([
      "core/p",
      "core/heading",
      "core/paragraph",
      "core/p",
    ]);
  });

  test("rewrites ids on the inlined body so two detaches of the same slug do not collide", () => {
    const data: Data = {
      content: [
        refNode("ref-1", "starter/hero"),
        refNode("ref-2", "starter/hero"),
      ],
      root: {},
    };

    const detachedFirst = detachPatternRef(data, 0, patterns);
    const detachedBoth = detachPatternRef(detachedFirst, 2, patterns);

    const ids = detachedBoth.content.map(
      (c) => (c.props as { id?: string }).id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("returns the data unchanged when the selected node is not a pattern-ref", () => {
    const data: Data = {
      content: [otherNode("a", "plain")],
      root: {},
    };

    const next = detachPatternRef(data, 0, patterns);

    expect(next).toBe(data);
  });

  test("returns the data unchanged when the slug is not registered", () => {
    const data: Data = {
      content: [refNode("ref-1", "missing/slug")],
      root: {},
    };

    const next = detachPatternRef(data, 0, patterns);

    expect(next).toBe(data);
  });

  test("does not mutate the input data or content array", () => {
    const data: Data = {
      content: [refNode("ref-1", "starter/hero")],
      root: {},
    };
    const snapshot = JSON.stringify(data);

    detachPatternRef(data, 0, patterns);

    expect(JSON.stringify(data)).toBe(snapshot);
  });
});
