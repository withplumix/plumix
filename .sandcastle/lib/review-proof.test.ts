import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { reviewHead } from "./review-proof.js";
import { ShipHistory } from "./ship-history.js";

describe("reviewHead", () => {
  test("an unreviewable working tree cannot receive approval", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-review-proof-"));
    const history = new ShipHistory(root);
    try {
      const reviewed = await reviewHead(1, history, {
        head: async () => "",
        review: async () => ({
          summary: "looks good",
          specGaps: [],
          notes: [],
        }),
      });
      expect(reviewed).toBeNull();
      expect(history.reviewedHead(1)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true });
    }
  });
  test("a changed commit requires a fresh review and cannot inherit approval", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-review-proof-"));
    const history = new ShipHistory(root);
    history.record({ type: "head.reviewed", issue: 1, headSha: "old" });
    let reviews = 0;
    try {
      const result = await reviewHead(1, history, {
        head: async () => "new",
        review: async () => {
          reviews++;
          return null;
        },
      });
      expect(reviews).toBe(1);
      expect(result).toBeNull();
      expect(history.reviewedHead(1)).toBe("old");
    } finally {
      rmSync(root, { recursive: true });
    }
  });
  test("approval is attached to the exact reviewed commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-review-proof-"));
    const history = new ShipHistory(root);
    try {
      await reviewHead(1, history, {
        head: async () => "abc",
        review: async () => ({ summary: "verified", specGaps: [], notes: [] }),
      });

      expect(history.reviewedHead(1)).toBe("abc");
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
