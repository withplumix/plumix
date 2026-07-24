import { describe, expect, test } from "vitest";

import { diffMetaBag } from "./meta-diff.js";

describe("diffMetaBag", () => {
  test("returns an empty patch when nothing changed", () => {
    const prev = { a: 1, b: "x" };
    expect(diffMetaBag(prev, { ...prev })).toEqual({});
  });

  test("includes only the changed key, not untouched foreign keys", () => {
    // `featuredImage` is a foreign key the editor never touches — it must not
    // be re-sent (and thus never re-validated) when another field changes.
    const prev = { subtitle: "old", featuredImage: { src: "/hero.jpg" } };
    const next = { subtitle: "new", featuredImage: { src: "/hero.jpg" } };
    expect(diffMetaBag(prev, next)).toEqual({ subtitle: "new" });
  });

  test("includes an added key", () => {
    expect(diffMetaBag({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: 2 });
  });

  test("emits null for a removed key (deletion request)", () => {
    expect(diffMetaBag({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: null });
  });

  test("detects deep value changes structurally, ignoring key order", () => {
    const prev = { cfg: { x: 1, y: 2 } };
    const reordered = { cfg: { y: 2, x: 1 } };
    expect(diffMetaBag(prev, reordered)).toEqual({});
    const changed = { cfg: { x: 1, y: 3 } };
    expect(diffMetaBag(prev, changed)).toEqual({ cfg: { x: 1, y: 3 } });
  });

  test("treats an explicit null value as a change from a set value", () => {
    expect(diffMetaBag({ a: 1 }, { a: null })).toEqual({ a: null });
  });
});
