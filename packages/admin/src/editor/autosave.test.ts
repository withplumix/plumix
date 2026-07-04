import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { classifyAutosaveError, isStaleConflictError } from "./autosave.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const staleConflict = new ORPCError("CONFLICT", {
  data: { reason: "stale_expected_updated_at" },
});

describe("isStaleConflictError", () => {
  test("true only for the stale optimistic-concurrency conflict", () => {
    expect(isStaleConflictError(staleConflict)).toBe(true);
  });

  test("false for a non-stale CONFLICT (e.g. content too large)", () => {
    expect(
      isStaleConflictError(
        new ORPCError("CONFLICT", { data: { reason: "content_too_large" } }),
      ),
    ).toBe(false);
  });

  test("false for a plain error", () => {
    expect(isStaleConflictError(new Error("network"))).toBe(false);
  });
});

describe("classifyAutosaveError", () => {
  const queryClient = { fetchQuery: vi.fn() } as never;

  test("an invalid-block-content rejection is a hard failure the author must see", async () => {
    // Regression: content that references a removed/unknown block is rejected
    // by the server. This must classify as `failed` (surfaced), never as a
    // recoverable conflict — otherwise the author's edit is silently dropped
    // (the "image disappeared on save" class of bug).
    const err = new ORPCError("INVALID_BLOCK_CONTENT", {
      data: { issues: ["unknown_block_type"] },
    });
    const outcome = await classifyAutosaveError(err, queryClient, 1);
    expect(outcome.kind).toBe("failed");
  });

  test("any non-conflict error is a hard failure", async () => {
    const outcome = await classifyAutosaveError(
      new Error("boom"),
      queryClient,
      1,
    );
    expect(outcome.kind).toBe("failed");
  });

  test("over-cap content (a non-stale CONFLICT) is a hard failure", async () => {
    const err = new ORPCError("CONFLICT", {
      data: { reason: "content_too_large" },
    });
    const outcome = await classifyAutosaveError(err, queryClient, 1);
    expect(outcome.kind).toBe("failed");
  });

  test("a stale conflict recovers, re-anchoring on the refetched row", async () => {
    const at = new Date("2026-07-04T00:00:00Z");
    const qc = { fetchQuery: vi.fn().mockResolvedValue({ updatedAt: at }) };
    const outcome = await classifyAutosaveError(staleConflict, qc as never, 1);
    expect(outcome).toEqual({ kind: "recovered", updatedAt: at });
  });

  test("a stale conflict whose refetch fails recovers quietly (retry on next edit)", async () => {
    // Must NOT become `failed` — the edit is intact and the next keystroke
    // retries; toasting here would nag on ordinary concurrent-tab churn.
    const qc = { fetchQuery: vi.fn().mockRejectedValue(new Error("offline")) };
    const outcome = await classifyAutosaveError(staleConflict, qc as never, 1);
    expect(outcome).toEqual({ kind: "recovered", updatedAt: null });
  });
});
