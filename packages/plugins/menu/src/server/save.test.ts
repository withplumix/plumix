import { describe, expect, test } from "vitest";

import type { SaveItemInput } from "./save.js";
import { flattenSaveItems, resolveParentIds } from "./save.js";

const item = (overrides: Partial<SaveItemInput> = {}): SaveItemInput => ({
  parentIndex: null,
  sortOrder: 0,
  title: null,
  meta: { kind: "custom", url: "/x" },
  ...overrides,
});

describe("flattenSaveItems", () => {
  test("empty input is valid", () => {
    const result = flattenSaveItems([], { maxDepth: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toEqual([]);
  });

  test("flat tree (all root-level) — every depth is 0", () => {
    const result = flattenSaveItems([item(), item(), item()], { maxDepth: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.map((i) => i.depth)).toEqual([0, 0, 0]);
      expect(result.items.map((i) => i.resolvedParentIndex)).toEqual([
        null,
        null,
        null,
      ]);
    }
  });

  test("nested tree — depths follow parent chain", () => {
    const result = flattenSaveItems(
      [
        item(), // 0: root
        item({ parentIndex: 0 }), // 1: child of 0
        item({ parentIndex: 1 }), // 2: child of 1
        item({ parentIndex: 0 }), // 3: child of 0
      ],
      { maxDepth: 5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.map((i) => i.depth)).toEqual([0, 1, 2, 1]);
    }
  });

  test("rejects forward parent reference (parent appears later in array)", () => {
    const result = flattenSaveItems(
      [
        item({ parentIndex: 1 }), // 0: refers to later item
        item(),
      ],
      { maxDepth: 5 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forward_parent_reference");
      expect((result.error as { index: number }).index).toBe(0);
    }
  });

  test("rejects self-parent reference", () => {
    const result = flattenSaveItems([item({ parentIndex: 0 })], {
      maxDepth: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("self_parent_reference");
    }
  });

  test("rejects out-of-range parent index (negative)", () => {
    const result = flattenSaveItems([item({ parentIndex: -1 })], {
      maxDepth: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parent_index_out_of_range");
    }
  });

  test("rejects out-of-range parent index (beyond array)", () => {
    const result = flattenSaveItems([item(), item({ parentIndex: 99 })], {
      maxDepth: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parent_index_out_of_range");
    }
  });

  test("rejects depth violation when nesting reaches maxDepth", () => {
    // maxDepth: 3 — depths 0, 1, 2 are OK (3 levels), depth 3 rejects.
    const result = flattenSaveItems(
      [
        item(), // 0 → depth 0
        item({ parentIndex: 0 }), // 1 → depth 1
        item({ parentIndex: 1 }), // 2 → depth 2
        item({ parentIndex: 2 }), // 3 → depth 3 (violates maxDepth=3)
      ],
      { maxDepth: 3 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("max_depth_exceeded");
      expect((result.error as { depth: number }).depth).toBe(3);
    }
  });

  test("preserves input order in flattened output", () => {
    const result = flattenSaveItems(
      [
        item({ sortOrder: 30 }),
        item({ sortOrder: 10 }),
        item({ sortOrder: 20 }),
      ],
      { maxDepth: 5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.map((i) => i.sortOrder)).toEqual([30, 10, 20]);
    }
  });

  test("preserves id, title, and meta on each flattened item", () => {
    const result = flattenSaveItems(
      [
        item({
          id: 7,
          title: "Hello",
          meta: { kind: "entry", entryId: 42 },
        }),
      ],
      { maxDepth: 5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]).toMatchObject({
        id: 7,
        title: "Hello",
        meta: { kind: "entry", entryId: 42 },
      });
    }
  });
});

describe("resolveParentIds", () => {
  test("empty input returns empty output", () => {
    const result = flattenSaveItems([], { maxDepth: 5 });
    if (!result.ok) throw new Error("flatten failed");
    expect(resolveParentIds(result.items, [])).toEqual([]);
  });

  test("root-level items resolve to null parentId", () => {
    const result = flattenSaveItems([item(), item()], { maxDepth: 5 });
    if (!result.ok) throw new Error("flatten failed");
    expect(resolveParentIds(result.items, [10, 11])).toEqual([null, null]);
  });

  test("nested items resolve to the parent's allocated id", () => {
    const result = flattenSaveItems(
      [item(), item({ parentIndex: 0 }), item({ parentIndex: 0 })],
      { maxDepth: 5 },
    );
    if (!result.ok) throw new Error("flatten failed");
    expect(resolveParentIds(result.items, [10, 11, 12])).toEqual([
      null,
      10,
      10,
    ]);
  });

  test("deep chain resolves each level to the prior id", () => {
    const result = flattenSaveItems(
      [item(), item({ parentIndex: 0 }), item({ parentIndex: 1 })],
      { maxDepth: 5 },
    );
    if (!result.ok) throw new Error("flatten failed");
    expect(resolveParentIds(result.items, [10, 11, 12])).toEqual([
      null,
      10,
      11,
    ]);
  });

  test("throws when length mismatch (programmer error, not user input)", () => {
    const result = flattenSaveItems([item()], { maxDepth: 5 });
    if (!result.ok) throw new Error("flatten failed");
    expect(() => resolveParentIds(result.items, [10, 11])).toThrow(
      /does not match/,
    );
  });
});
