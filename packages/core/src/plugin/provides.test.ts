import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createAppContext } from "../context/app.js";
import { getContext, requestStore } from "../context/stores.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import { installPlugins } from "./register.js";

declare module "./provides-context.js" {
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

declare module "../context/app.js" {
  interface AppContextExtensions {
    audit: { readonly log: (message: string) => void };
    metrics: { readonly inc: (name: string) => void };
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
    // Cast bypasses the typed key constraint to simulate a plugin
    // sidestepping module augmentation.
    const evil = definePlugin("evil", {
      provides: (ctx) => {
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

  test("app-context extensions are collected and surfaced on the install result", async () => {
    // Slice 11 deferred subscribers because action handlers couldn't
    // reach AppContext from the test harness; this opens the door —
    // a plugin registers a helper, the install result hands it to the
    // dispatcher, the dispatcher merges it into each per-request ctx.
    const audit = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", {
          log: (message: string) => `logged:${message}`,
        });
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [audit],
    });

    const entry = result.appContextExtensions.get("audit");
    expect(entry?.pluginId).toBe("audit");
    expect(typeof entry?.value).toBe("object");
  });

  test("createAppContext merges install-result app extensions onto ctx", async () => {
    // Surface contract: a plugin's extendAppContext entry shows up at
    // `ctx.<key>` after installPlugins → createAppContext. This is what
    // RPC handlers, route handlers, and (cycle 4) hook listeners read.
    const audit = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", {
          log: (m: string) => `audit:${m}`,
        });
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [audit],
    });

    // Stub Db typed as the default CoreSchema so AppContext doesn't
    // resolve to a non-default generic that breaks requestStore.run().
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      hooks: result.hooks,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    expect(ctx.audit.log("hello")).toBe("audit:hello");
  });

  test("createAppContext refuses to overwrite a base field via a malformed extensions map", () => {
    // Belt-and-braces: even when the registration-time guard is bypassed
    // (a test or dev tool builds an extensions map by hand), the
    // dispatcher won't let an entry shadow `db` etc. on the per-request
    // ctx — fail fast rather than silently corrupt every request.
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const malformed = new Map<string, { readonly value: unknown }>([
      ["db", { value: { broken: true } }],
    ]);

    expect(() =>
      createAppContext({
        db: stubDb,
        env: {},
        request: new Request("https://x.example/"),
        hooks: new HookRegistry(),
        plugins: { entryTypes: new Map() } as never,
        appContextExtensions: malformed,
      }),
    ).toThrow(/"db".*built-in AppContext field/);
  });

  test("two plugins extending different app-context keys both land on ctx", async () => {
    const audit = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", { log: () => "audit-ok" });
      },
      setup: () => undefined,
    });
    const metrics = definePlugin("metrics", {
      provides: (ctx) => {
        ctx.extendAppContext("metrics", { inc: () => undefined });
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [audit, metrics],
    });

    // Stub Db typed as the default CoreSchema so AppContext doesn't
    // resolve to a non-default generic that breaks requestStore.run().
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      hooks: result.hooks,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    expect(ctx.audit.log("x")).toBe("audit-ok");
    expect(typeof ctx.metrics.inc).toBe("function");
  });

  test("hook listener reads extensions via requestStore.getStore() at fire-time", async () => {
    // The motivating use case from slice 11 deferred subscribers: a
    // plugin's `addAction` listener can't take an AppContext arg
    // because the action signature is fixed, so it pulls ctx out of
    // the requestStore. Once that ctx carries plugin-contributed
    // extensions, the listener gets cross-plugin helpers for free.
    const captured: string[] = [];

    const auditProvider = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", {
          log: (m: string) => {
            captured.push(m);
          },
        });
      },
      setup: () => undefined,
    });

    const consumer = definePlugin("consumer", {
      setup: (ctx) => {
        ctx.registerAction("ping", () => {
          getContext().audit.log("from-listener");
        });
      },
    });

    const result = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [auditProvider, consumer],
    });

    // Stub Db typed as the default CoreSchema so AppContext doesn't
    // resolve to a non-default generic that breaks requestStore.run().
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      hooks: result.hooks,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    // The hook is registered as a plugin-prefixed dynamic action — its
    // name isn't in the ActionRegistry, so loosen the call type.
    const doAction = (name: string): Promise<void> =>
      (result.hooks.doAction as (name: string) => Promise<void>)(name);
    await requestStore.run(ctx as AppContext, async () => {
      await doAction("consumer:ping");
    });

    expect(captured).toEqual(["from-listener"]);
  });

  test("extending with a key that shadows a built-in AppContext field throws", async () => {
    // Without this guard, a plugin calling extendAppContext("db", ...)
    // would silently overwrite the real database connection on every
    // request — same hazard the extendPluginContext shadow check
    // already protects against for setup-time members.
    const evil = definePlugin("evil", {
      provides: (ctx) => {
        (
          ctx.extendAppContext as unknown as (
            key: string,
            value: unknown,
          ) => void
        )("db", { broken: true });
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [evil] }),
    ).rejects.toThrow(/"db".*collides with a built-in AppContext member/s);
  });

  test("extending with a reserved name like __proto__ throws (no prototype pollution)", async () => {
    const evil = definePlugin("evil", {
      provides: (ctx) => {
        (
          ctx.extendAppContext as unknown as (
            key: string,
            value: unknown,
          ) => void
        )("__proto__", { polluted: true });
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [evil] }),
    ).rejects.toThrow(/reserved name "__proto__"/);
  });

  test("two plugins extending the same app-context key throw with both ids", async () => {
    const a = definePlugin("a", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", { log: () => undefined });
      },
      setup: () => undefined,
    });
    const b = definePlugin("b", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", { log: () => undefined });
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [a, b] }),
    ).rejects.toThrow(/Plugin "b" extended.*"audit".*"a" already registered/s);
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
