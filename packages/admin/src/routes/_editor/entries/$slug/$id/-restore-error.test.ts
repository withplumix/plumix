import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { restoreErrorDescriptor } from "./-restore-error.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restoreErrorDescriptor", () => {
  test("a stale-token conflict asks the editor to reload", () => {
    const err = new ORPCError("CONFLICT", {
      data: { reason: "stale_expected_updated_at" },
    });
    expect(restoreErrorDescriptor(err)).toMatchObject({
      id: "editor.revision.conflict",
    });
  });

  test("a failure it has no reason for gets the retry copy, not its text", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(restoreErrorDescriptor(new ORPCError("FORBIDDEN"))).toMatchObject({
      id: "editor.revision.restoreFailed",
      message: "Couldn't restore this revision — try again.",
    });
  });
});
