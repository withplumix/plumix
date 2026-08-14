import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../../../plugin/manifest.js";
import { adminUser, userFactory } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { registerCoreLookupAdapters } from "../lookup-adapters.js";

function registryWithCoreAdapters() {
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  return registry;
}

describe("lookup.list", () => {
  test("returns adapter list results for a known kind", async () => {
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await userFactory
      .transient({ db: h.context.db })
      .create({ email: "alpha@example.test", name: "Alpha" });
    await userFactory
      .transient({ db: h.context.db })
      .create({ email: "beta@example.test", name: "Beta" });

    const result = await h.client.lookup.list({
      kind: "user",
      query: "alpha",
    });
    expect(result.items.find((i) => i.label === "Alpha")).toBeDefined();
    expect(result.items.find((i) => i.label === "Beta")).toBeUndefined();
  });

  test("404s when the kind has no registered adapter", async () => {
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await expect(
      h.client.lookup.list({ kind: "nonexistent" }),
    ).rejects.toThrow();
  });

  test("requires authentication", async () => {
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ plugins });
    await expect(h.client.lookup.list({ kind: "user" })).rejects.toThrow();
  });

  test("forwards scope to the adapter", async () => {
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await adminUser.transient({ db: h.context.db }).create({ name: "Admin1" });
    await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author", name: "Author1" });

    const adminsOnly = await h.client.lookup.list({
      kind: "user",
      scope: { roles: ["admin"] },
    });
    expect(adminsOnly.items.find((i) => i.label === "Admin1")).toBeDefined();
    expect(adminsOnly.items.find((i) => i.label === "Author1")).toBeUndefined();
  });
});

describe("lookup capability gating", () => {
  test("subscribers (no `user:list` capability) get FORBIDDEN on user lookup", async () => {
    // Subscribers can authenticate but can't list users — picker access
    // would otherwise enumerate every email + name across the system.
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ authAs: "subscriber", plugins });
    await userFactory
      .transient({ db: h.context.db })
      .create({ email: "leak@example.test", name: "Leak Target" });

    await expect(h.client.lookup.list({ kind: "user" })).rejects.toThrow();
  });

  test("editors (with `user:list`) can call user lookup", async () => {
    const plugins = registryWithCoreAdapters();
    const h = await createRpcHarness({ authAs: "editor", plugins });
    const result = await h.client.lookup.list({ kind: "user", limit: 1 });
    expect(result.items).toBeDefined();
  });
});
