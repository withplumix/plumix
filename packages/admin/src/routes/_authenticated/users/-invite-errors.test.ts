import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { describeInviteError } from "./-invite-errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeInviteError", () => {
  test("an email that already has a user shows the duplicate copy", () => {
    const err = new ORPCError("CONFLICT", { data: { reason: "email_taken" } });

    expect(describeInviteError(err).message).toBe(
      "A user with that email already exists.",
    );
  });

  test("a failure it has no reason for shows the retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(describeInviteError(new ORPCError("FORBIDDEN")).message).toBe(
      "Couldn't send invite. Try again.",
    );
  });
});
