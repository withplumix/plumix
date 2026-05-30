import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { insertPatternCopy } from "./insert-pattern.js";

const blank: Data = { content: [], root: {} };

const heading = (id: string, text: string): BlockNode => ({
  id,
  name: "core/heading",
  attrs: { level: 1, text },
});

function texts(data: Data): readonly unknown[] {
  return data.content.map((c) => (c.props as { text?: unknown }).text);
}

function ids(data: Data): readonly unknown[] {
  return data.content.map((c) => (c.props as { id?: unknown }).id);
}

describe("insertPatternCopy", () => {
  test("appends the pattern body at the destination index", () => {
    const pattern: readonly BlockNode[] = [
      heading("p1", "Hero"),
      heading("p2", "Tagline"),
    ];

    const next = insertPatternCopy(blank, pattern, 0);

    expect(next.content).toHaveLength(2);
    expect(next.content[0]?.type).toBe("core/heading");
    expect(texts(next)).toEqual(["Hero", "Tagline"]);
  });

  test("splices into the middle of existing content", () => {
    const existing: Data = {
      content: [
        { type: "core/p", props: { id: "a", text: "before" } },
        { type: "core/p", props: { id: "b", text: "after" } },
      ],
      root: {},
    };
    const pattern: readonly BlockNode[] = [heading("p1", "Middle")];

    const next = insertPatternCopy(existing, pattern, 1);

    expect(texts(next)).toEqual(["before", "Middle", "after"]);
  });

  test("rewrites ids so two inserts of the same pattern produce distinct ids", () => {
    const pattern: readonly BlockNode[] = [heading("p1", "Hero")];

    const first = insertPatternCopy(blank, pattern, 0);
    const second = insertPatternCopy(blank, pattern, 0);

    const firstId = ids(first)[0];
    const secondId = ids(second)[0];
    expect(firstId).not.toBe("p1");
    expect(secondId).not.toBe("p1");
    expect(firstId).not.toBe(secondId);
  });

  test("preserves data.root and existing content reference shape", () => {
    const existing: Data = {
      content: [{ type: "core/p", props: { id: "a", text: "x" } }],
      root: { props: { title: "Page" } },
    };
    const pattern: readonly BlockNode[] = [heading("p1", "Hero")];

    const next = insertPatternCopy(existing, pattern, 1);

    expect(next.root).toEqual({ props: { title: "Page" } });
    expect(existing.content).toHaveLength(1);
  });
});
