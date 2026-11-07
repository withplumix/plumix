import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { PluginDescriptor } from "../../src/plugin/define.js";
import { entryCapability } from "../../src/access/contract/capability.js";
import { definePlugin } from "../../src/plugin/define.js";
import { authenticated } from "../../src/rpc/authenticated.js";
import { base } from "../../src/rpc/base.js";
import { requireCapability } from "../../src/rpc/require-capability.js";
import { testSite } from "../../src/test/site.js";

const probeRouter = {
  manageSettings: base
    .use(authenticated)
    .use(requireCapability("settings:manage"))
    .handler(() => "ok" as const),
  listUsers: base
    .use(authenticated)
    .use(requireCapability("user:list"))
    .handler(() => "ok" as const),
  // Composed before `.input()`, as every call site is, so a caller without the
  // capability gets FORBIDDEN before validation can leak the input shape.
  manageSettingsWithInput: base
    .use(authenticated)
    .use(requireCapability("settings:manage"))
    .input(v.object({ n: v.number() }))
    .handler(() => "ok" as const),
  createNews: base
    .use(authenticated)
    .use(requireCapability(entryCapability("news", "create")))
    .handler(() => "ok" as const),
  publishNews: base
    .use(authenticated)
    .use(requireCapability(entryCapability("news", "publish")))
    .handler(() => "ok" as const),
};

function probe(): PluginDescriptor<
  undefined,
  { readonly probe: typeof probeRouter }
> {
  return definePlugin("probe", {
    setup: (ctx) => {
      // `news` pools its permissions with `post`, so `entry:post:*` gates it.
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
      ctx.registerRpcRouter(probeRouter);
    },
  });
}

const site = await testSite({
  plugins: [probe()],
  config: {
    roles: {
      // Writes posts but never publishes them.
      contributor: {
        can: {
          admin: ["access"],
          user: ["edit_own"],
          entry: { post: ["read", "create", "edit_own"] },
          term: { category: ["read", "assign"], tag: ["read", "assign"] },
        },
      },
    },
  },
});

describe("a procedure that requires a capability", () => {
  test("refuses a caller lacking the capability with FORBIDDEN", async () => {
    const calling = site.actingAs("editor").rpc.probe.manageSettings();

    await expect(calling).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("reaches the handler when the caller holds the capability", async () => {
    const result = await site.actingAs("editor").rpc.probe.listUsers();

    expect(result).toBe("ok");
  });

  test("refuses with FORBIDDEN before validating input that is also invalid", async () => {
    const calling = site
      .actingAs("editor")
      .rpc.probe.manageSettingsWithInput({ n: "not-a-number" } as never);

    await expect(calling).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("lets a caller through on the namespace its entry type pools into", async () => {
    const result = await site.actingAs("contributor").rpc.probe.createNews();

    expect(result).toBe("ok");
  });

  test("names the pooled namespace's capability when it refuses", async () => {
    const calling = site.actingAs("contributor").rpc.probe.publishNews();

    await expect(calling).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });
});
