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
});
