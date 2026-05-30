import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";

import {
  insertPattern,
  insertPatternCopy,
  insertPatternReference,
} from "./insert-pattern.js";

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

describe("insertPatternReference", () => {
  test("splices a single core/pattern-ref node carrying the target slug", () => {
    const next = insertPatternReference(blank, "starter/hero", 0);

    expect(next.content).toHaveLength(1);
    const node = next.content[0];
    expect(node?.type).toBe("core/pattern-ref");
    expect((node?.props as { slug?: unknown }).slug).toBe("starter/hero");
  });

  test("produces a fresh id on every call (two refs to the same slug do not collide)", () => {
    const first = insertPatternReference(blank, "starter/hero", 0);
    const second = insertPatternReference(blank, "starter/hero", 0);

    const firstId = (first.content[0]?.props as { id?: unknown }).id;
    const secondId = (second.content[0]?.props as { id?: unknown }).id;
    expect(typeof firstId).toBe("string");
    expect(typeof secondId).toBe("string");
    expect(firstId).not.toBe(secondId);
  });

  test("splices into the middle of existing content without mutating input", () => {
    const existing: Data = {
      content: [
        { type: "core/p", props: { id: "a", text: "before" } },
        { type: "core/p", props: { id: "b", text: "after" } },
      ],
      root: {},
    };

    const next = insertPatternReference(existing, "starter/hero", 1);

    expect(next.content.map((c) => c.type)).toEqual([
      "core/p",
      "core/pattern-ref",
      "core/p",
    ]);
    expect(existing.content).toHaveLength(2);
  });
});

describe("insertPattern (mode dispatcher)", () => {
  const copyPattern: PatternManifestEntry = {
    name: "starter/hero",
    title: "Hero",
    insert: "copy",
    content: [heading("p1", "Hello")],
  };

  const refPattern: PatternManifestEntry = {
    name: "starter/footer",
    title: "Footer",
    insert: "reference",
    content: [heading("p1", "Should not be inlined")],
  };

  test("copy mode splices the inlined body", () => {
    const next = insertPattern(blank, copyPattern, 0);
    expect(next.content[0]?.type).toBe("core/heading");
  });

  test("reference mode splices a single core/pattern-ref carrying the slug", () => {
    const next = insertPattern(blank, refPattern, 0);
    expect(next.content).toHaveLength(1);
    expect(next.content[0]?.type).toBe("core/pattern-ref");
    expect((next.content[0]?.props as { slug?: unknown }).slug).toBe(
      "starter/footer",
    );
  });
});
