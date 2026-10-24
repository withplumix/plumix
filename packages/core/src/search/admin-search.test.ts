import { beforeAll, describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { SearchGroup } from "../plugin/search-provider.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createTestContext, silentLogger } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { runAdminSearch } from "./admin-search.js";

let db: AppContext["db"];
beforeAll(async () => {
  db = await createTestDb();
});
const input = { query: "hello", limit: 5 };

function group(key: string, priority: number, items = 1): SearchGroup {
  return {
    key,
    label: { id: `g.${key}`, message: key },
    priority,
    items: Array.from({ length: items }, (_, i) => ({
      id: `${key}-${i}`,
      title: `${key} ${i}`,
    })),
  };
}

const named = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i)}`,
    title: `${prefix} ${String(i)}`,
  }));

/** A context whose registry holds one provider per search, in order. */
function contextWith(
  searches: readonly (() => readonly SearchGroup[])[],
): AppContext {
  const plugins = createPluginRegistry();
  searches.forEach((search, i) => {
    const id = `p${String(i)}`;
    plugins.searchProviders.set(id, { id, registeredBy: id, search });
  });
  return createTestContext({ db, plugins });
}

describe("runAdminSearch", () => {
  test("merges every provider's groups, ordered by priority", async () => {
    const ctx = contextWith([
      () => [group("users", 30)],
      () => [group("entry:post", 10), group("entry:page", 11)],
    ]);

    const groups = await runAdminSearch(input, ctx);

    expect(groups.map((g) => g.key)).toEqual([
      "entry:post",
      "entry:page",
      "users",
    ]);
  });

  test("a failing provider core registered is logged as core's", async () => {
    const error = vi.fn();
    const plugins = createPluginRegistry();
    plugins.searchProviders.set("core", {
      id: "core",
      registeredBy: null,
      search: () => {
        throw new Error("boom");
      },
    });
    const ctx = createTestContext({
      db,
      plugins,
      logger: { ...silentLogger, error },
    });

    expect(await runAdminSearch(input, ctx)).toEqual([]);
    expect(error.mock.calls).toEqual([
      [
        "[plumix] search provider failed provider=core plugin=core: boom",
        { provider: "core", plugin: null, error: new Error("boom") },
      ],
    ]);
  });

  test("drops groups that have no items", async () => {
    const ctx = contextWith([
      () => [group("entry:post", 10, 0)],
      () => [group("users", 30, 1)],
    ]);

    const groups = await runAdminSearch(input, ctx);

    expect(groups.map((g) => g.key)).toEqual(["users"]);
  });

  test("providers sharing a key fill one group, earliest first", async () => {
    // How a search plugin leads a core domain: it answers ahead of core's
    // provider, so its ranked matches head the group and core's fill in behind.
    const ranked: SearchGroup = {
      ...group("entry:post", 10),
      items: [{ id: "ranked", title: "Ranked" }],
    };
    const ctx = contextWith([
      () => [ranked],
      () => [group("entry:post", 10), group("entry:page", 11)],
    ]);

    const groups = await runAdminSearch(input, ctx);

    expect(groups.map((g) => g.key)).toEqual(["entry:post", "entry:page"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "ranked",
      "entry:post-0",
    ]);
  });

  test("an item two providers both found is shown once", async () => {
    const ctx = contextWith([
      () => [group("entry:post", 10, 2)],
      () => [group("entry:post", 10, 3)],
    ]);

    const groups = await runAdminSearch(input, ctx);

    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "entry:post-0",
      "entry:post-1",
      "entry:post-2",
    ]);
  });

  test("a merged group holds no more than the caller asked for", async () => {
    const ctx = contextWith([
      () => [{ ...group("entry:post", 10, 4), items: named("a", 4) }],
      () => [{ ...group("entry:post", 10, 4), items: named("b", 4) }],
    ]);

    const groups = await runAdminSearch({ ...input, limit: 5 }, ctx);

    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "a0",
      "a1",
      "a2",
      "a3",
      "b0",
    ]);
  });
});

describe("search providers in a booted app", () => {
  const posts = definePlugin("posts", (ctx) => {
    ctx.registerEntryType("post", {
      label: { id: "et.post", message: "Posts" },
    });
  });

  // One `post` matching "hello", and what the palette shows the admin.
  async function palette(
    options: Parameters<typeof createDispatcherHarness>[0],
  ): Promise<readonly SearchGroup[]> {
    const h = await createDispatcherHarness(options);
    const admin = await h.seedUser("admin");
    await h.factory.entry.create({
      authorId: admin.id,
      type: "post",
      title: "Hello World",
      slug: "hello",
      status: "published",
    });
    const response = await h.fetch("/_plumix/rpc/search/query", {
      method: "POST",
      json: { json: { query: "hello" } },
      as: admin,
    });
    response.assertStatus(200);
    const body = await response.json<{ json: readonly SearchGroup[] }>();
    return body.json;
  }

  const ranked = (id: string, order?: "early" | "late") =>
    definePlugin(id, (ctx) => {
      ctx.registerSearchProvider({
        id,
        order,
        search: () => [
          {
            key: "entry:post",
            label: "Posts",
            priority: 10,
            items: [{ id: id, title: id }],
          },
        ],
      });
    });

  test("an early provider's entries lead core's in the same group", async () => {
    const groups = await palette({
      config: { plugins: [posts, ranked("ranked", "early")] },
    });

    expect(
      groups.map((group) => group.items.map((item) => item.title)),
    ).toEqual([["ranked", "Hello World"]]);
  });

  test("without a plugin, core's provider answers alone", async () => {
    const groups = await palette({ config: { plugins: [posts] } });

    expect(
      groups.map((group) => group.items.map((item) => item.title)),
    ).toEqual([["Hello World"]]);
  });

  test("a provider that throws is logged and the others still answer", async () => {
    const error = vi.fn();
    const broken = definePlugin("broken", (ctx) => {
      ctx.registerSearchProvider({
        id: "broken",
        search: () => {
          throw new Error("index offline");
        },
      });
    });

    const groups = await palette({
      config: { plugins: [posts, broken, ranked("ranked")] },
      logger: { ...silentLogger, error },
    });

    expect(
      groups.map((group) => group.items.map((item) => item.title)),
    ).toEqual([["Hello World", "ranked"]]);
    expect(error.mock.calls).toEqual([
      [
        "[plumix] search provider failed provider=broken plugin=broken: index offline",
        {
          provider: "broken",
          plugin: "broken",
          error: new Error("index offline"),
        },
      ],
    ]);
  });

  test("a provider id already registered fails boot", async () => {
    const twin = definePlugin("twin", (ctx) => {
      ctx.registerSearchProvider({ id: "ranked", search: () => [] });
    });

    await expect(
      createDispatcherHarness({
        config: { plugins: [ranked("ranked"), twin] },
      }),
    ).rejects.toThrow(
      'Plugin "twin" registers search provider "ranked" already registered by "ranked".',
    );
  });

  test("core's provider id is taken", async () => {
    await expect(
      createDispatcherHarness({ config: { plugins: [ranked("core")] } }),
    ).rejects.toThrow(
      'Plugin "core" registers search provider "core" already registered by core.',
    );
  });

  test("a late provider fills after every unordered one", async () => {
    const groups = await palette({
      config: {
        plugins: [posts, ranked("last", "late"), ranked("unordered")],
      },
    });

    expect(
      groups.map((group) => group.items.map((item) => item.title)),
    ).toEqual([["Hello World", "unordered", "last"]]);
  });
});
