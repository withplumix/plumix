import { describe, expect, expectTypeOf, test } from "vitest";

import type { AdminBarNodeOptions } from "./admin-bar-node.js";
import { HookRegistry } from "../hooks/registry.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { definePlugin } from "./define.js";

describe("registerAdminBarNode", () => {
  test("a node id two plugins register fails boot naming both", async () => {
    const node = { id: "orders", group: "primary", title: "Orders" } as const;

    await expect(
      installPlugins({
        hooks: new HookRegistry(),
        plugins: [
          definePlugin("shop", {
            setup: (ctx) => {
              ctx.registerAdminBarNode(node);
            },
          }),
          definePlugin("cart", {
            setup: (ctx) => {
              ctx.registerAdminBarNode(node);
            },
          }),
        ],
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: "DuplicateRegistrationError",
        message:
          'Plugin "cart" registers admin bar node "orders" already registered by "shop".',
      }),
    );
  });

  test("a plugin's node has no action, which only core's sign-out uses", () => {
    expectTypeOf<AdminBarNodeOptions>().not.toHaveProperty("action");
  });
});
