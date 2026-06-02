import { describe, expect, test } from "vitest";

import { renderHookWithI18n } from "../../../../../test/render-with-i18n.js";
import { useTermErrorMessage } from "./-errors.js";

// Public-API contract for the term-mutation error → friendly-copy
// translator. Hooks form because the resolver needs the active
// `i18n` instance to render descriptors at the call locale; the
// underlying reason-table is the durable contract the route forms
// rely on for `setServerError(mapTerm(err, fallback))`.

function withReason(reason: string): unknown {
  return { data: { reason } };
}

describe("useTermErrorMessage", () => {
  test("slug_taken → localized duplicate-slug message", () => {
    const { result } = renderHookWithI18n(() => useTermErrorMessage());
    expect(result.current(withReason("slug_taken"), "fb")).toMatch(
      /slug already exists/i,
    );
  });

  test("parent_mismatch → localized cross-taxonomy message", () => {
    const { result } = renderHookWithI18n(() => useTermErrorMessage());
    expect(result.current(withReason("parent_mismatch"), "fb")).toMatch(
      /different taxonomy/i,
    );
  });

  test("parent_is_self and parent_cycle alias to one ancestor message", () => {
    const { result } = renderHookWithI18n(() => useTermErrorMessage());
    const a = result.current(withReason("parent_is_self"), "fb");
    const b = result.current(withReason("parent_cycle"), "fb");
    expect(a).toBe(b);
    expect(a).toMatch(/its own ancestor/i);
  });

  test("unknown reason falls through to the thrown Error's own message", () => {
    const { result } = renderHookWithI18n(() => useTermErrorMessage());
    const err = new Error("server explained the failure");
    expect(result.current(err, "fb")).toBe("server explained the failure");
  });

  test("non-Error throws fall to the caller-provided fallback", () => {
    const { result } = renderHookWithI18n(() => useTermErrorMessage());
    expect(result.current("just a string", "couldn't save")).toBe(
      "couldn't save",
    );
    expect(result.current(undefined, "fallback B")).toBe("fallback B");
  });

  test("an Error with a server `reason` prefers the reason mapping over .message", () => {
    // Real oRPC errors arrive as `class extends Error` with `data` —
    // pin that the reason wins so a generic `err.message` ("Bad
    // Request") doesn't shadow the friendly translation.
    const err = Object.assign(new Error("Bad Request"), {
      data: { reason: "slug_taken" },
    });
    expect(result(useTermErrorMessage)(err, "fb")).toMatch(
      /slug already exists/i,
    );
  });
});

function result(hook: typeof useTermErrorMessage) {
  const { result } = renderHookWithI18n(hook);
  return result.current;
}
