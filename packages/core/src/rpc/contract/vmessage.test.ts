import { afterEach, describe, expect, test } from "vitest";

import { setI18nResolver, vMessage } from "./vmessage.js";

afterEach(() => {
  // Drop any resolver state set by individual tests so the next case
  // starts from the source-locale-fallback default.
  setI18nResolver(null);
});

describe("vMessage", () => {
  test("returns a function valibot accepts as its message slot", () => {
    const message = vMessage({ id: "test.foo", message: "Foo English" });
    expect(typeof message).toBe("function");
  });

  test("falls back to `descriptor.message` when no resolver is registered", () => {
    // Server-side / pre-boot path: no Lingui instance is available, so
    // the validator surfaces the source-locale message verbatim. RPC
    // error payloads use this branch unchanged.
    const message = vMessage({ id: "test.foo", message: "Foo English" });
    expect(message()).toBe("Foo English");
  });

  test("resolves through `setI18nResolver` when one is registered", () => {
    setI18nResolver((d) => `LOCALIZED(${d.id})`);
    const message = vMessage({ id: "test.bar", message: "Bar English" });
    expect(message()).toBe("LOCALIZED(test.bar)");
  });

  test("falls back to `descriptor.id` when neither resolver nor message exists", () => {
    // Edge case for `defineMessage({ id })` without an inline message —
    // returning the id is uglier than `descriptor.message` but better
    // than crashing on `undefined` rendering.
    const message = vMessage({ id: "test.no-message" });
    expect(message()).toBe("test.no-message");
  });

  test("setI18nResolver(null) unregisters and reverts to source fallback", () => {
    setI18nResolver((d) => `LOCALIZED(${d.id})`);
    setI18nResolver(null);
    const message = vMessage({ id: "test.foo", message: "Foo English" });
    expect(message()).toBe("Foo English");
  });
});
