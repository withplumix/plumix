import { ORPCError } from "@orpc/client";
import { describe, expect, test } from "vitest";

import { classifyAutosaveError } from "./autosave.js";

describe("classifyAutosaveError", () => {
  test("a stale copy is a conflict carrying the entry's current etag and change time", () => {
    const err = new ORPCError("CONFLICT", {
      data: {
        reason: "etag_mismatch",
        etag: "1792411205",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });

    expect(classifyAutosaveError(err)).toEqual({
      kind: "conflict",
      conflict: {
        etag: "1792411205",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });
  });

  test("an invalid-block-content rejection is a hard failure the author must see", () => {
    const err = new ORPCError("INVALID_BLOCK_CONTENT", {
      data: { issues: ["unknown_block_type"] },
    });

    expect(classifyAutosaveError(err)).toEqual({ kind: "failed" });
  });

  test("over-cap content (a CONFLICT of another reason) is a hard failure", () => {
    const err = new ORPCError("CONFLICT", {
      data: { reason: "content_too_large" },
    });

    expect(classifyAutosaveError(err)).toEqual({ kind: "failed" });
  });

  test("a stale-copy payload under another error code is a hard failure", () => {
    const err = new ORPCError("FORBIDDEN", {
      data: {
        reason: "etag_mismatch",
        etag: "1792411205",
        updatedAt: new Date("2026-10-18T12:00:05Z"),
      },
    });

    expect(classifyAutosaveError(err)).toEqual({ kind: "failed" });
  });

  test("any non-RPC error is a hard failure", () => {
    expect(classifyAutosaveError(new Error("network"))).toEqual({
      kind: "failed",
    });
  });
});
