import { ORPCError } from "@orpc/client";
import { describe, expect, test } from "vitest";

import { etagConflict } from "./conflict.js";

const ada = { id: 2, name: "Ada" };

describe("etagConflict", () => {
  test("reads where a resource with a version token is now", () => {
    const error = new ORPCError("CONFLICT", {
      data: { reason: "etag_mismatch", etag: "4" },
    });

    expect(etagConflict(error)).toEqual({ etag: "4" });
  });

  test("keeps when it changed and who is editing it, when the conflict says", () => {
    const updatedAt = new Date("2026-10-18T12:00:00Z");
    const error = new ORPCError("CONFLICT", {
      data: {
        reason: "etag_mismatch",
        etag: "1792324800",
        updatedAt,
        holder: ada,
      },
    });

    expect(etagConflict(error)).toEqual({
      etag: "1792324800",
      updatedAt,
      holder: ada,
    });
  });

  test.each([
    new ORPCError("CONFLICT", { data: { reason: "slug_taken" } }),
    new ORPCError("LOCKED", { data: { holder: ada, since: new Date() } }),
    new Error("offline"),
  ])("anything but a stale copy is no conflict", (error) => {
    expect(etagConflict(error)).toBeUndefined();
  });
});
