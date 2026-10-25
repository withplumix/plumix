import { describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { SyncAfterEvent } from "../context/runtime-adapter.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { HookRegistry } from "./registry.js";
import { sync } from "./sync.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  hooks: new HookRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("sync", () => {
  test("an after handler is handed the sync's scopes and direction, and the ctx", () => {
    ctx.events.on(sync.after, (event, handlerCtx) => {
      expectTypeOf(event).toEqualTypeOf<SyncAfterEvent>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
  });

  test("an event can't be passed to filters.add", () => {
    // @ts-expect-error an event is not a filter
    ctx.filters.add(sync.after, () => undefined);
  });
});
