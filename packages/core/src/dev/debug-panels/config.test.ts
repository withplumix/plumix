import { describe, expect, test } from "vitest";

import type { DebugPanelsInput } from "./config.js";
import { disabledPanelIds } from "./config.js";

// The point of the registry, and the reason this is a type and not a runtime
// check: the old free-string denylist accepted a typo and silently did nothing.
// `tsc` fails on an unused `@ts-expect-error`, so these stop being satisfied
// the moment the key set reopens.
describe("panel ids are closed", () => {
  test("a registered core id is nameable", () => {
    const input: DebugPanelsInput = { database: false };

    expect(disabledPanelIds(input).has("database")).toBe(true);
  });

  test("a misspelled id does not type-check", () => {
    // @ts-expect-error `databse` is not a registered panel id.
    const input: DebugPanelsInput = { databse: false };

    expect(input).toBeDefined();
  });
});

describe("disabledPanelIds", () => {
  test("disables nothing when unconfigured", () => {
    expect(disabledPanelIds(undefined).size).toBe(0);
  });

  test("a panel set to `false` is disabled", () => {
    const disabled = disabledPanelIds({ database: false });

    expect(disabled.has("database")).toBe(true);
    expect(disabled.has("request")).toBe(false);
  });

  test("a panel set to `true` is left enabled", () => {
    expect(disabledPanelIds({ database: true }).has("database")).toBe(false);
  });
});
