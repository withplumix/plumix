import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { restoreErrorDescriptor } from "./-restore-error.js";

const RESTORE = { kind: "restore", revisionId: 42 } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restoreErrorDescriptor", () => {
  test("a stale copy says the entry changed since it was opened, as the editor's conflict does", () => {
    const err = new ORPCError("CONFLICT", {
      data: { reason: "etag_mismatch" },
    });
    expect(restoreErrorDescriptor(err, RESTORE)).toMatchObject({
      id: "editor.revision.conflict",
      message: "This entry changed since you opened it. Reload and try again.",
    });
  });

  test("a failure it has no reason for gets the retry copy, not its text", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      restoreErrorDescriptor(new ORPCError("FORBIDDEN"), RESTORE),
    ).toMatchObject({
      id: "editor.revision.restoreFailed",
      message: "Couldn't restore this revision — try again.",
    });
  });

  test("an autosave the leaving editor sent that failed is no restore error", () => {
    const failed = restoreErrorDescriptor(new ORPCError("BAD_REQUEST"), {
      kind: "update",
      patch: { title: "Left behind" },
    });

    expect(failed).toBeUndefined();
  });

  test("a reload that failed is no restore error", () => {
    expect(
      restoreErrorDescriptor(new Error("offline"), "reload"),
    ).toBeUndefined();
  });
});
