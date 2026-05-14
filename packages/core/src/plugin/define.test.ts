import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { definePlugin } from "./define.js";

const noop = (): void => undefined;

describe("definePlugin — schemaModule warning", () => {
  let warnSpy: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("warns when schema is set but schemaModule is missing", () => {
    definePlugin("test_plugin_schema_only", noop, {
      schema: { someTable: {} },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain("test_plugin_schema_only");
    expect(message).toContain("schemaModule");
  });

  test("stays silent when both schema and schemaModule are set", () => {
    definePlugin("test_plugin_with_both", noop, {
      schema: { someTable: {} },
      schemaModule: "@example/plugin/schema",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("stays silent when neither schema nor schemaModule is set", () => {
    definePlugin("test_plugin_neither", noop);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("warns via the input-object form too", () => {
    definePlugin("test_plugin_input_form", {
      setup: noop,
      schema: { someTable: {} },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
      "test_plugin_input_form",
    );
  });

  test("warns only once when the same plugin id is defined repeatedly", () => {
    definePlugin("test_plugin_repeat", noop, { schema: { someTable: {} } });
    definePlugin("test_plugin_repeat", noop, { schema: { someTable: {} } });
    definePlugin("test_plugin_repeat", noop, { schema: { someTable: {} } });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
