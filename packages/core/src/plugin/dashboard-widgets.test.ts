import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import { DuplicateRegistrationError } from "./errors.js";
import { buildManifest } from "./manifest.js";
import { installPlugins } from "./register.js";

describe("registerDashboardWidget", () => {
  test("registers a widget and projects it into the manifest", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        definePlugin("widget-plugin", (ctx) => {
          ctx.registerDashboardWidget({
            id: "widget-plugin:hello",
            title: { id: "x", message: "Hello" },
            component: "HelloWidget",
            priority: 20,
          });
        }),
      ],
    });
    const widget = registry.dashboardWidgets.get("widget-plugin:hello");
    expect(widget?.component).toBe("HelloWidget");
    expect(widget?.registeredBy).toBe("widget-plugin");

    const manifest = buildManifest(registry, { tokens: {} });
    expect(manifest.dashboardWidgets[0]?.id).toBe("widget-plugin:hello");
  });

  test("widgets project in priority order", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        definePlugin("widget-plugin", (ctx) => {
          ctx.registerDashboardWidget({
            id: "widget-plugin:b",
            title: { id: "b", message: "B" },
            component: "B",
            priority: 30,
          });
          ctx.registerDashboardWidget({
            id: "widget-plugin:a",
            title: { id: "a", message: "A" },
            component: "A",
            priority: 10,
          });
        }),
      ],
    });
    const manifest = buildManifest(registry, { tokens: {} });
    expect(manifest.dashboardWidgets.map((w) => w.id)).toEqual([
      "widget-plugin:a",
      "widget-plugin:b",
    ]);
  });

  test("rejects a duplicate widget id", async () => {
    await expect(
      installPlugins({
        hooks: new HookRegistry(),
        plugins: [
          definePlugin("widget-plugin", (ctx) => {
            const opts = {
              id: "widget-plugin:dup",
              title: { id: "d", message: "D" },
              component: "Dup",
            };
            ctx.registerDashboardWidget(opts);
            ctx.registerDashboardWidget(opts);
          }),
        ],
      }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  test("rejects a non-namespaced widget id", async () => {
    await expect(
      installPlugins({
        hooks: new HookRegistry(),
        plugins: [
          definePlugin("widget-plugin", (ctx) => {
            ctx.registerDashboardWidget({
              id: "nocolon",
              title: { id: "n", message: "N" },
              component: "N",
            });
          }),
        ],
      }),
    ).rejects.toBeTruthy();
  });

  test("rejects a widget whose namespace isn't the registering plugin", async () => {
    await expect(
      installPlugins({
        hooks: new HookRegistry(),
        plugins: [
          definePlugin("widget-plugin", (ctx) => {
            ctx.registerDashboardWidget({
              id: "other-plugin:thing",
              title: { id: "o", message: "O" },
              component: "O",
            });
          }),
        ],
      }),
    ).rejects.toBeTruthy();
  });
});
