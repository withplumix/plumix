import { describe, expect, test } from "vitest";

import type { PluginSetupContext } from "../plugin/setup-context-types.js";
import { auth } from "../auth/config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";
import { plumix } from "./define-config.js";

const stubAdapter = {
  name: "test" as const,
  handler: {},
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: [fallback(() => null)] });

const appWith = (setup: (ctx: PluginSetupContext) => void): Promise<unknown> =>
  buildApp(
    plumix({
      runtime: stubAdapter,
      database: stubDatabase,
      auth: stubAuth,
      theme: stubTheme,
      plugins: [definePlugin("shop", setup)],
    }),
  );

describe("buildApp — admin bar nodes", () => {
  test("rejects a node whose parent no plugin or core registered", async () => {
    await expect(
      appWith((ctx) => {
        ctx.registerAdminBarNode({
          id: "shop:orders",
          group: "primary",
          title: "Orders",
          parent: "shop:menu",
        });
      }),
    ).rejects.toThrow(
      'Admin bar node "shop:orders" names parent "shop:menu", which isn\'t a registered node.',
    );
  });

  test("rejects a node that claims one of core's ids, naming core", async () => {
    await expect(
      appWith((ctx) => {
        ctx.registerAdminBarNode({ id: "site", group: "root", title: "Shop" });
      }),
    ).rejects.toThrow(
      'Plugin "shop" registers admin bar node "site" already registered by core.',
    );
  });

  test("rejects a node that claims a + New child's id, naming the plugin and core", async () => {
    await expect(
      appWith((ctx) => {
        ctx.registerEntryType("product", { label: "Product" });
        ctx.registerAdminBarNode({
          id: "+new:product",
          group: "+new",
          title: "Product",
        });
      }),
    ).rejects.toThrow(
      'Plugin "shop" registers admin bar node "+new:product" already registered by core.',
    );
  });
});
