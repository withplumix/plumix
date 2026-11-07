import { describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { SettingsBag } from "../db/schema/settings.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { HandlerRegistry } from "./registry.js";
import { settings } from "./settings.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  handlers: new HandlerRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("settings", () => {
  test("a group-changed handler is handed the group, the keys set and the keys removed", () => {
    ctx.events.on(settings.groupChanged, (payload, handlerCtx) => {
      expectTypeOf(payload).toEqualTypeOf<{
        readonly group: string;
        readonly set: SettingsBag;
        readonly removed: readonly string[];
      }>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
  });

  test("a group's scope has the shape of the unscoped events", () => {
    expectTypeOf(settings.for("shop").groupChanged).toEqualTypeOf(
      settings.groupChanged,
    );
  });
});
