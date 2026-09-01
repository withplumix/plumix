import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { SearchGroup } from "./admin-search.js";
import { runAdminSearch } from "./admin-search.js";

const ctx = {} as AppContext;
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

function hooksWith(
  handlers: readonly ((input: unknown, ctx: unknown) => unknown)[],
): Pick<HookExecutor, "getFilterHandlers"> {
  return {
    getFilterHandlers: () =>
      handlers.map((fn) => ({ fn: fn as never, plugin: null })),
  } as Pick<HookExecutor, "getFilterHandlers">;
}

describe("runAdminSearch", () => {
  test("merges every handler's groups, ordered by priority", async () => {
    const hooks = hooksWith([
      () => [group("users", 30)],
      () => [group("entry:post", 10), group("entry:page", 11)],
    ]);

    const groups = await runAdminSearch(hooks, input, ctx);

    expect(groups.map((g) => g.key)).toEqual([
      "entry:post",
      "entry:page",
      "users",
    ]);
  });

  test("isolates a failing handler so the others still return", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const hooks = hooksWith([
      () => {
        throw new Error("boom");
      },
      () => [group("entry:post", 10)],
    ]);

    const groups = await runAdminSearch(hooks, input, ctx);

    expect(groups.map((g) => g.key)).toEqual(["entry:post"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("drops groups that have no items", async () => {
    const hooks = hooksWith([
      () => [group("entry:post", 10, 0)],
      () => [group("users", 30, 1)],
    ]);

    const groups = await runAdminSearch(hooks, input, ctx);

    expect(groups.map((g) => g.key)).toEqual(["users"]);
  });

  test("handlers sharing a key fill one group, earliest first", async () => {
    // How a search plugin leads a core domain: it registers ahead of core's
    // handler, so its ranked matches head the group and core's fill in behind.
    const ranked: SearchGroup = {
      ...group("entry:post", 10),
      items: [{ id: "ranked", title: "Ranked" }],
    };
    const hooks = hooksWith([
      () => [ranked],
      () => [group("entry:post", 10), group("entry:page", 11)],
    ]);

    const groups = await runAdminSearch(hooks, input, ctx);

    expect(groups.map((g) => g.key)).toEqual(["entry:post", "entry:page"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "ranked",
      "entry:post-0",
    ]);
  });

  test("an item two handlers both found is shown once", async () => {
    const hooks = hooksWith([
      () => [group("entry:post", 10, 2)],
      () => [group("entry:post", 10, 3)],
    ]);

    const groups = await runAdminSearch(hooks, input, ctx);

    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "entry:post-0",
      "entry:post-1",
      "entry:post-2",
    ]);
  });

  test("a merged group holds no more than the caller asked for", async () => {
    const hooks = hooksWith([
      () => [{ ...group("entry:post", 10, 4), items: named("a", 4) }],
      () => [{ ...group("entry:post", 10, 4), items: named("b", 4) }],
    ]);

    const groups = await runAdminSearch(hooks, { ...input, limit: 5 }, ctx);

    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "a0",
      "a1",
      "a2",
      "a3",
      "b0",
    ]);
  });
});
