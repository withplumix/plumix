import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { describeAllowedDomainError } from "./-errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeAllowedDomainError", () => {
  test("a domain already on the list shows the duplicate copy", () => {
    const err = new ORPCError("CONFLICT", {
      data: { reason: "domain_exists" },
    });

    expect(describeAllowedDomainError(err).message).toBe(
      "That domain is already configured.",
    );
  });

  test("a failure it has no reason for shows the retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(describeAllowedDomainError(new ORPCError("FORBIDDEN")).message).toBe(
      "Couldn't save the domain. Try again.",
    );
  });
});
