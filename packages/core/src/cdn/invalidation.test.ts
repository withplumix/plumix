import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "../context/app-context.js";
import type { CacheRead } from "./contract/subjects.js";
import { HookRegistry } from "../hooks/registry.js";
import { readTags } from "../plugin/cache-tags.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import {
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "../plugin/registry.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { declaredPageTags } from "./contract/page-tags.js";
import {
  recordRead,
  recordWrite,
  registerCoreInvalidation,
} from "./invalidation.js";
import { flushPurgeTags } from "./purge.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function registry() {
  const plugins = createPluginRegistry();
  for (const [name, options] of [
    ["post", { label: "Posts", isPublic: true }],
    ["page", { label: "Pages", isPublic: true, isHierarchical: true }],
    ["note", { label: "Notes", isPublic: false }],
  ] as const) {
    plugins.entryTypes.set(name, toRegisteredEntryType(name, options, "test"));
  }
  plugins.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy(
      "category",
      { label: "Categories", entryTypes: ["post"] },
      "test",
    ),
  );
  plugins.termTaxonomies.set(
    "tag",
    toRegisteredTermTaxonomy("tag", { label: "Tags" }, "test"),
  );
  return plugins;
}

function purgingCtx(cdn: "purges" | "absent" = "purges") {
  const purgeTags = vi.fn<(tags: readonly string[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const ctx = createTestContext({
    db,
    cdn:
      cdn === "absent"
        ? undefined
        : {
            decorate: vi.fn(),
            store: { match: vi.fn(), put: vi.fn() },
            purgeTags,
          },
    defer: (promise: Promise<unknown>) => {
      void promise;
    },
    plugins: registry(),
  });
  return { ctx, purgeTags };
}

describe("recordRead", () => {
  it("stores the response under the tags of what it read", () => {
    const { ctx } = purgingCtx();

    recordRead(ctx, [{ kind: "term", id: 3 }]);
    recordRead(ctx, [{ kind: "taxonomy", taxonomy: "category" }]);

    expect(declaredPageTags(ctx)).toEqual(["tm:3", "t:post"]);
  });
});

describe("recordWrite", () => {
  it("purges what the write changed once the request flushes", () => {
    const { ctx, purgeTags } = purgingCtx();

    recordWrite(ctx, [{ kind: "entry", id: 7, type: "post" }]);
    recordWrite(ctx, [{ kind: "entry", id: 8, type: "post" }]);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledExactlyOnceWith(["t:post", "e:7", "e:8"]);
  });

  it("drops the memo entries that read what the write changed", async () => {
    const { ctx } = purgingCtx("absent");
    const loads: string[] = [];
    const read = (key: string, reads: readonly CacheRead[]) =>
      ctx.memo(
        key,
        () => {
          loads.push(key);
          return Promise.resolve(key);
        },
        readTags(ctx.plugins, reads),
      );
    await read("menu", [{ kind: "term", id: 3 }]);
    await read("other", [{ kind: "term", id: 4 }]);
    loads.length = 0;

    recordWrite(ctx, [{ kind: "term", id: 3, taxonomy: "tag" }]);
    await read("menu", [{ kind: "term", id: 3 }]);
    await read("other", [{ kind: "term", id: 4 }]);

    expect(loads).toEqual(["menu"]);
  });
});

describe("registerCoreInvalidation", () => {
  // Loose-typed: each action's payload differs, so the tests fire by name.
  const fire = (hooks: HookRegistry, name: string, ...args: unknown[]) =>
    (hooks.doAction as (n: string, ...a: unknown[]) => Promise<void>).call(
      hooks,
      name,
      ...args,
    );

  const entry = { id: 9, type: "post" };
  const term = { id: 3, taxonomy: "category" };
  const jane = { id: 4, name: "Jane", slug: "jane" };
  const changes = { set: {}, removed: [] };

  it.each<[string, readonly unknown[], readonly string[]]>([
    ["entry:published", [entry], ["t:post", "e:9"]],
    ["entry:updated", [entry, entry], ["t:post", "e:9"]],
    ["entry:meta_changed", [entry, changes], ["t:post", "e:9"]],
    ["entry:trashed", [entry], ["t:post", "e:9"]],
    ["entry:restored", [entry], ["t:post", "e:9"]],
    ["entry:deleted", [entry], ["t:post", "e:9"]],
    ["term:created", [term], ["t:post", "tm:3"]],
    ["term:updated", [term, term], ["t:post", "tm:3"]],
    ["term:meta_changed", [term, changes], ["t:post", "tm:3"]],
    ["term:deleted", [term], ["t:post", "tm:3"]],
    ["user:updated", [jane, jane], ["t:post", "t:page", "u:4"]],
    // A save that changes only meta skips `user:updated`, and public pages
    // still print what meta holds: an author's image roles.
    ["user:meta_changed", [jane, changes], ["t:post", "t:page", "u:4"]],
    ["user:deleted", [jane, { reassignedTo: 1 }], ["t:post", "t:page", "u:4"]],
    ["settings:group_changed", [{ group: "site" }], ["s:site"]],
  ])("%s purges what it changed", async (event, payload, tags) => {
    const hooks = new HookRegistry();
    registerCoreInvalidation(hooks);
    const { ctx, purgeTags } = purgingCtx();

    await fire(hooks, event, ...payload, ctx);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledExactlyOnceWith(tags);
  });

  it("batches a bulk publish into one purge call", async () => {
    const hooks = new HookRegistry();
    registerCoreInvalidation(hooks);
    const { ctx, purgeTags } = purgingCtx();

    await fire(hooks, "entry:published", { id: 1, type: "post" }, ctx);
    await fire(hooks, "entry:published", { id: 2, type: "post" }, ctx);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledExactlyOnceWith(["t:post", "e:1", "e:2"]);
  });
});
