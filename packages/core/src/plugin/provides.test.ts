import { describe, expect, test } from "vitest";

import { createAppContext } from "../context/app.js";
import { getContext, requestStore } from "../context/stores.js";
import { defineEvent } from "../events-and-filters/define.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { testConfig } from "../test/config.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { definePlugin } from "./define.js";

declare module "./provides-context.js" {
  interface PluginContextExtensions {
    registerMenuItemType(type: string, opts: { readonly label: string }): void;
    media: {
      url(key: string): string;
    };
  }
}

declare module "../context/app-context.js" {
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

    const cart = definePlugin("cart", {
      setup: (ctx) => {
        ctx.registerMenuItemType("cart-link", { label: "Cart" });
      },
    });

    await installPlugins({
      handlers: new HandlerRegistry(),
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

    const cart = definePlugin("cart", {
      setup: (ctx) => {
        ctx.registerMenuItemType("cart-link", { label: "Cart" });
      },
    });

    await installPlugins({
      handlers: new HandlerRegistry(),
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

    const consumer = definePlugin("consumer", {
      setup: (ctx) => {
        captured = (key) => ctx.media.url(key);
      },
    });

    await installPlugins({
      handlers: new HandlerRegistry(),
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
      installPlugins({ handlers: new HandlerRegistry(), plugins: [a, b] }),
    ).rejects.toThrow(
      /Plugin "b" extended.*"registerMenuItemType".*"a" already registered/s,
    );
  });

  // `plugins` is a member of the after-setup context only. `evil` declares no
  // `afterSetup`, so the key has to be rejected whether or not one is built.
  test.each(["events", "plugins"])(
    "extending with a key that shadows a built-in (%s) throws",
    async (key) => {
      // Cast bypasses the typed key constraint to simulate a plugin
      // sidestepping module augmentation.
      const evil = definePlugin("evil", {
        provides: (ctx) => {
          (
            ctx.extendPluginContext as unknown as (
              key: string,
              value: unknown,
            ) => void
          )(key, () => undefined);
        },
        setup: () => undefined,
      });

      await expect(
        installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
      ).rejects.toThrow(
        new RegExp(`"${key}" collides with a built-in PluginSetupContext`),
      );
    },
  );

  test("app-context extensions are collected and surfaced on the install result", async () => {
    const audit = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", {
          log: (message: string) => `logged:${message}`,
        });
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [audit],
    });

    const entry = result.appContextExtensions.get("audit");
    expect(entry?.pluginId).toBe("audit");
    expect(typeof entry?.value).toBe("object");
  });

  test("createAppContext merges install-result app extensions onto ctx", async () => {
    // Surface contract: a plugin's extendAppContext entry shows up at
    // `ctx.<key>` after installPlugins → createAppContext. This is what
    // RPC handlers, route handlers, and event handlers read.
    const audit = definePlugin("audit", {
      provides: (ctx) => {
        ctx.extendAppContext("audit", {
          log: (m: string) => `audit:${m}`,
        });
      },
      setup: () => undefined,
    });

    const result = await installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [audit],
    });

    // Stub Db typed as the default CoreSchema so AppContext doesn't
    // resolve to a non-default generic that breaks requestStore.run().
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      config: testConfig(),
      handlers: result.handlers,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    expect(ctx.audit.log("hello")).toBe("audit:hello");
  });

  test("createAppContext refuses to overwrite a base field via a malformed extensions map", () => {
    // A hand-built extensions map bypasses the registration guard, so the
    // dispatcher must still refuse to shadow `db` and friends.
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const malformed = new Map<string, { readonly value: unknown }>([
      ["db", { value: { broken: true } }],
    ]);

    expect(() =>
      createAppContext({
        db: stubDb,
        env: {},
        request: new Request("https://x.example/"),
        config: testConfig(),
        handlers: new HandlerRegistry(),
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
      handlers: new HandlerRegistry(),
      plugins: [audit, metrics],
    });

    // Stub Db typed as the default CoreSchema so AppContext doesn't
    // resolve to a non-default generic that breaks requestStore.run().
    const stubDb = {} as Parameters<typeof createAppContext>[0]["db"];
    const ctx = createAppContext({
      db: stubDb,
      env: {},
      request: new Request("https://x.example/"),
      config: testConfig(),
      handlers: result.handlers,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    expect(ctx.audit.log("x")).toBe("audit-ok");
    expect(typeof ctx.metrics.inc).toBe("function");
  });

  test("an event handler reads extensions via getContext() when the event fires", async () => {
    const captured: string[] = [];
    const pinged = defineEvent<undefined>("consumer:pinged");

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
        ctx.events.on(pinged, () => {
          getContext().audit.log("from-listener");
        });
      },
    });

    const result = await installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [auditProvider, consumer],
    });

    const ctx = createTestContext({
      db: await createTestDb(),
      handlers: result.handlers,
      plugins: result.registry,
      appContextExtensions: result.appContextExtensions,
    });

    await requestStore.run(ctx, () => ctx.events.emit(pinged, undefined));

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
      installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
    ).rejects.toThrow(/"db".*collides with a built-in AppContext member/s);
  });

  // A plugin replacing either would hand every handler its own dispatcher.
  test.each(["events", "filters"])(
    "extending with '%s' throws at registration",
    async (key) => {
      const evil = definePlugin("evil", {
        provides: (ctx) => {
          (
            ctx.extendAppContext as unknown as (
              key: string,
              value: unknown,
            ) => void
          )(key, {});
        },
        setup: () => undefined,
      });

      await expect(
        installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
      ).rejects.toThrow(
        new RegExp(`"${key}".*collides with a built-in AppContext member`, "s"),
      );
    },
  );

  test("extending with 'apiToken' throws at registration", async () => {
    // A plugin replacing the token a request authenticated with would
    // misattribute the revisions its saves write.
    const evil = definePlugin("evil", {
      provides: (ctx) => {
        (
          ctx.extendAppContext as unknown as (
            key: string,
            value: unknown,
          ) => void
        )("apiToken", { id: "x", name: "forged" });
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
    ).rejects.toThrow(
      /"apiToken".*collides with a built-in AppContext member/s,
    );
  });

  test("extending with 'telemetryConsumers' throws at registration", async () => {
    // Assigned after the extension spread, so the per-request shadow check
    // never sees it and registration is the only gate.
    const evil = definePlugin("evil", {
      provides: (ctx) => {
        (
          ctx.extendAppContext as unknown as (
            key: string,
            value: unknown,
          ) => void
        )("telemetryConsumers", { broken: true });
      },
      setup: () => undefined,
    });

    await expect(
      installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
    ).rejects.toThrow(
      /"telemetryConsumers".*collides with a built-in AppContext member/s,
    );
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
      installPlugins({ handlers: new HandlerRegistry(), plugins: [evil] }),
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
      installPlugins({ handlers: new HandlerRegistry(), plugins: [a, b] }),
    ).rejects.toThrow(/Plugin "b" extended.*"audit".*"a" already registered/s);
  });

  test("plugin without provides still installs (back-compat)", async () => {
    const plain = definePlugin("plain", {
      setup: (ctx) => {
        ctx.registerCapability("plain:cap");
      },
    });

    const { registry } = await installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [plain],
    });
    expect(registry.capabilities.get("plain:cap")?.grantTo).toEqual(["admin"]);
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

    const cart = definePlugin("cart", {
      setup: (ctx) => {
        order.push("cart:setup");
        ctx.registerMenuItemType("link", { label: "L" });
      },
    });

    await installPlugins({
      handlers: new HandlerRegistry(),
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
      installPlugins({ handlers: new HandlerRegistry(), plugins: [dupe] }),
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
      handlers: new HandlerRegistry(),
      plugins: [selfConsumer],
    });
    expect(recorded).toEqual(["self-link"]);
  });
});
