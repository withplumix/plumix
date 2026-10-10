import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app-context.js";
import type { DebugPanelsInput } from "../../context/dev-runtime.js";
import { CORE_DEBUG_PANEL_IDS } from "../../context/dev-runtime.js";
import { HookRegistry } from "../../hooks/registry.js";
import { createTestContext } from "../../test/context.js";
import { createTestDb } from "../../test/harness.js";
import { collectDebugPanels } from "./collect.js";
import { disabledPanelIds } from "./config.js";
import { registerCoreDebugPanels } from "./core-panels.js";

// A type rather than a runtime check, so a typo fails `tsc` instead of
// silently doing nothing.
describe("panel ids are closed", () => {
  // Closed is only worth anything if the closed set is the real one: a
  // registry key with no panel behind it type-checks and hides nothing.
  test("core's registry ids are exactly the panels core registers", async () => {
    const hooks = new HookRegistry();
    registerCoreDebugPanels(hooks);
    const ctx: AppContext = createTestContext({ db: await createTestDb() });

    const registered = collectDebugPanels(hooks, ctx, new Set())
      .map((p) => p.id)
      .sort();

    expect(registered).toEqual([...CORE_DEBUG_PANEL_IDS].sort());
  });

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
