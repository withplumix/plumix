import { describe, expect, test } from "vitest";

import {
  canRedo,
  canUndo,
  initHistory,
  recordHistory,
  redo,
  undo,
} from "./history.js";

describe("history", () => {
  test("a fresh history can neither undo nor redo", () => {
    const h = initHistory("a");
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  test("recording a discrete edit enables undo and restores the prior value", () => {
    let h = initHistory("a");
    h = recordHistory(h, "b", null);
    expect(h.present).toBe("b");
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present).toBe("a");
    expect(canRedo(h)).toBe(true);

    h = redo(h);
    expect(h.present).toBe("b");
  });

  test("consecutive same-key edits coalesce into one undo step", () => {
    let h = initHistory("");
    h = recordHistory(h, "h", "type");
    h = recordHistory(h, "he", "type");
    h = recordHistory(h, "hel", "type");
    expect(h.present).toBe("hel");

    // One undo jumps straight back past the whole typing burst.
    h = undo(h);
    expect(h.present).toBe("");
    expect(canUndo(h)).toBe(false);
  });

  test("a different key starts a new undo step", () => {
    let h = initHistory("");
    h = recordHistory(h, "a", "type");
    h = recordHistory(h, "ab", "type");
    h = recordHistory(h, "ab+block", "insert");

    h = undo(h);
    expect(h.present).toBe("ab");
    h = undo(h);
    expect(h.present).toBe("");
  });

  test("a null key never coalesces, even back to back", () => {
    let h = initHistory("a");
    h = recordHistory(h, "b", null);
    h = recordHistory(h, "c", null);
    h = undo(h);
    expect(h.present).toBe("b");
  });

  test("a new edit after undo clears the redo stack", () => {
    let h = initHistory("a");
    h = recordHistory(h, "b", null);
    h = undo(h);
    expect(canRedo(h)).toBe(true);

    h = recordHistory(h, "c", null);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe("c");
  });

  test("undo at the start and redo at the end are no-ops", () => {
    const h = initHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  test("the past is capped so a long session can't grow unbounded", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 250; i++) h = recordHistory(h, i, null);

    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    // Bounded, and the oldest values fell off (never reach 0).
    expect(steps).toBeLessThanOrEqual(100);
    expect(h.present).toBeGreaterThan(0);
  });
});
