import type { MessageDescriptor } from "@lingui/core";
import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { describeTermError } from "./-errors.js";

// Public-API contract for the term-mutation error → descriptor
// translator; the reason table is what the route forms rely on for
// `setServerError(describeTermError(err, fallback))`.

const fallback: MessageDescriptor = {
  id: "test.fallback",
  message: "Couldn't save the term.",
};

function withReason(reason: string): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", { data: { reason } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeTermError", () => {
  test("slug_taken → localized duplicate-slug message", () => {
    expect(
      describeTermError(withReason("slug_taken"), fallback).message,
    ).toMatch(/slug already exists/i);
  });

  test("parent_mismatch → localized cross-taxonomy message", () => {
    expect(
      describeTermError(withReason("parent_mismatch"), fallback).message,
    ).toMatch(/different taxonomy/i);
  });

  test("parent_is_self and parent_cycle alias to one ancestor message", () => {
    const a = describeTermError(withReason("parent_is_self"), fallback);
    const b = describeTermError(withReason("parent_cycle"), fallback);
    expect(a).toBe(b);
    expect(a.message).toMatch(/its own ancestor/i);
  });

  test("a failure with no mapped reason shows the caller's fallback, not its own message", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new ORPCError("FORBIDDEN", {
      message: "server explained the failure",
    });
    expect(describeTermError(err, fallback)).toBe(fallback);
  });

  test("an unknown reason shows the caller's fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(describeTermError(withReason("insert_failed"), fallback)).toBe(
      fallback,
    );
  });

  test("non-Error throws show the caller's fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(describeTermError("just a string", fallback)).toBe(fallback);
    expect(describeTermError(undefined, fallback)).toBe(fallback);
  });
});
