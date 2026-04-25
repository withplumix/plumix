import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import { installPlugins } from "./register.js";

declare module "./context.js" {
  interface PluginContextExtensions {
    registerMenuItemType(type: string, opts: { readonly label: string }): void;
    media: {
      url(key: string): string;
    };
  }
  interface ThemeContextExtensions {
    registerMenuLocation(id: string, opts: { readonly label: string }): void;
  }
}

describe("provides phase", () => {
  test("setup ctx sees extensions registered by another plugin's provides", async () => {
    const recorded: { type: string; label: string }[] = [];

    const menus = definePlugin("menus", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", (type, opts) => {
          recorded.push({ type, label: opts.label });
        });
      },
      setup: () => undefined,
    });

    const cart = definePlugin("cart", (ctx) => {
      ctx.registerMenuItemType("cart-link", { label: "Cart" });
    });

    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [menus, cart],
    });
    expect(recorded).toEqual([{ type: "cart-link", label: "Cart" }]);
  });

  test("config order doesn't matter — consumer registered before provider still sees the extension", async () => {
    const recorded: string[] = [];

    const menus = definePlugin("menus", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", (type) => {
          recorded.push(type);
        });
      },
      setup: () => undefined,
    });

    const cart = definePlugin("cart", (ctx) => {
      ctx.registerMenuItemType("cart-link", { label: "Cart" });
    });

    // Cart appears first in the array — its setup must still see the
    // menus extension because all `provides` run before any `setup`.
    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [cart, menus],
    });
    expect(recorded).toEqual(["cart-link"]);
  });

  test("non-function extension values are returned as-is", async () => {
    let captured: ((key: string) => string) | undefined;

    const media = definePlugin("media", {
      provides: (ctx) => {
        ctx.extendPluginContext("media", {
          url: (key: string) => `https://cdn.example/${key}`,
        });
      },
      setup: () => undefined,
    });

    const consumer = definePlugin("consumer", (ctx) => {
      // Wrap so the bound-method check stays happy and the captured
      // closure resolves `url` against the same `ctx.media` instance.
      captured = (key) => ctx.media.url(key);
    });

    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [media, consumer],
    });
    expect(captured?.("logo.png")).toBe("https://cdn.example/logo.png");
  });

  test("two plugins extending the same plugin-context key throw with both ids", async () => {
    const a = definePlugin("a", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", () => undefined);
      },
      setup: () => undefined,
    });
    const b = definePlugin("b", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", () => undefined);
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [a, b] }),
    ).rejects.toThrow(
      /Plugin "b" extended.*"registerMenuItemType".*"a" already registered/s,
    );
  });

  test("extending with a key that shadows a built-in registrar throws", async () => {
    const evil = definePlugin("evil", {
      provides: (ctx) => {
        // Cast through unknown — TS protects callers via
        // PluginContextExtensions, this test simulates a plugin
        // bypassing types.
        (
          ctx.extendPluginContext as unknown as (
            key: string,
            value: unknown,
          ) => void
        )("addFilter", () => undefined);
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [evil] }),
    ).rejects.toThrow(
      /"addFilter" collides with a built-in PluginSetupContext/,
    );
  });

  test("theme extensions are collected and surfaced on the install result", async () => {
    const menus = definePlugin("menus", {
      provides: (ctx) => {
        ctx.extendThemeContext("registerMenuLocation", (id, opts) => ({
          id,
          opts,
        }));
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [menus],
    });

    const entry = result.themeExtensions.get("registerMenuLocation");
    expect(entry?.pluginId).toBe("menus");
    expect(typeof entry?.value).toBe("function");
  });

  test("two plugins extending the same theme-context key throw with both ids", async () => {
    const a = definePlugin("a", {
      provides: (ctx) => {
        ctx.extendThemeContext("registerMenuLocation", () => undefined);
      },
      setup: () => undefined,
    });
    const b = definePlugin("b", {
      provides: (ctx) => {
        ctx.extendThemeContext("registerMenuLocation", () => undefined);
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [a, b] }),
    ).rejects.toThrow(
      /Plugin "b" extended.*"registerMenuLocation".*"a" already registered/s,
    );
  });

  test("plugin without provides still installs (back-compat)", async () => {
    const plain = definePlugin("plain", (ctx) => {
      ctx.registerCapability("plain:cap", "admin");
    });

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [plain],
    });
    expect(registry.capabilities.get("plain:cap")?.minRole).toBe("admin");
  });

  test("passing legacy 3rd-arg options alongside the options-form throws", () => {
    // Bypass overload resolution — the call shape isn't reachable from
    // either typed overload, so we drop into the runtime guard.
    const callRaw = definePlugin as unknown as (...args: unknown[]) => unknown;
    expect(() =>
      callRaw("y", { setup: () => undefined }, { version: "1.0.0" }),
    ).toThrow(/pass options inside the input object/);
  });

  test("async provides callback is awaited before any setup runs", async () => {
    const order: string[] = [];

    const menus = definePlugin("menus", {
      provides: async (ctx) => {
        await Promise.resolve();
        order.push("menus:provides");
        ctx.extendPluginContext("registerMenuItemType", () => {
          order.push("cart:registerMenuItemType");
        });
      },
      setup: () => {
        order.push("menus:setup");
      },
    });

    const cart = definePlugin("cart", (ctx) => {
      order.push("cart:setup");
      ctx.registerMenuItemType("link", { label: "L" });
    });

    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [menus, cart],
    });
    expect(order).toEqual([
      "menus:provides",
      "menus:setup",
      "cart:setup",
      "cart:registerMenuItemType",
    ]);
  });

  test("a plugin extending the same key twice in its own provides throws", async () => {
    const dupe = definePlugin("dupe", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", () => undefined);
        ctx.extendPluginContext("registerMenuItemType", () => undefined);
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [dupe] }),
    ).rejects.toThrow(
      /Plugin "dupe" extended.*"registerMenuItemType".*"dupe" already registered/s,
    );
  });

  test("a plugin's own setup can call extensions it provided", async () => {
    const recorded: string[] = [];

    const selfConsumer = definePlugin("self", {
      provides: (ctx) => {
        ctx.extendPluginContext("registerMenuItemType", (type) => {
          recorded.push(type);
        });
      },
      setup: (ctx) => {
        ctx.registerMenuItemType("self-link", { label: "Self" });
      },
    });

    await installPlugins({
      hooks: new HookRegistry(),
      plugins: [selfConsumer],
    });
    expect(recorded).toEqual(["self-link"]);
  });
});
