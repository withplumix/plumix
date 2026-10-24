import { beforeAll, describe, expect, it } from "vitest";

import type { AppContext, Db } from "../context/app-context.js";
import type { CdnFake } from "../test/cdn-fake.js";
import { withUser } from "../auth/with-user.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import {
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "../plugin/registry.js";
import { fakeCdn } from "../test/cdn-fake.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import {
  entryPurgeTags,
  entryTag,
  settingsTag,
  typeTag,
  userTag,
} from "./contract/tags.js";
import {
  enqueuePurgeTags,
  flushPurgeTags,
  registerCorePurgeInvalidator,
} from "./purge.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

/** One stored page under each tag a write here can reach, keyed by path. */
const PAGES: Readonly<Record<string, string>> = {
  "/post": typeTag("post"),
  "/page": typeTag("page"),
  "/note": typeTag("note"),
  "/post/9": entryTag(9),
  "/post/8": entryTag(8),
  "/settings/site": settingsTag("site"),
  "/settings/seo": settingsTag("seo"),
  "/author/4": userTag(4),
};

async function storePages(cdn: CdnFake): Promise<void> {
  for (const [path, tag] of Object.entries(PAGES)) {
    await cdn.store.put(
      new Request(`https://cms.example${path}`),
      new Response(path),
      [tag],
    );
  }
}

/** Fails naming the first page whose presence is not what the purge implies. */
function assertOnlyPurged(cdn: CdnFake, purged: readonly string[]): void {
  for (const path of Object.keys(PAGES)) {
    if (purged.includes(path)) cdn.assertNotStored(path);
    else cdn.assertStored(path);
  }
}

async function fakeCtx(
  cdnMode: "purges" | "cannot-purge" | "absent" = "purges",
) {
  const cdn = fakeCdn();
  await storePages(cdn);
  const { purgeTags: _cannotPurge, ...withoutPurge } = cdn;
  const deferred: Promise<unknown>[] = [];
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
  const ctx = createTestContext({
    db,
    cdn:
      cdnMode === "absent"
        ? undefined
        : cdnMode === "purges"
          ? cdn
          : withoutPurge,
    defer: (promise) => {
      deferred.push(promise);
    },
    plugins,
  });
  // Flush as the request's end does, and wait for the purge it deferred.
  const flush = async () => {
    flushPurgeTags(ctx);
    await Promise.all(deferred);
  };
  return { ctx, cdn, deferred, flush };
}

describe("purge accumulator", () => {
  it("flushes a single purge for tags from multiple enqueues", async () => {
    const { ctx, cdn, deferred, flush } = await fakeCtx();

    // Two entries of the same type — the bulk-publish shape.
    enqueuePurgeTags(ctx, entryPurgeTags("post", 9));
    enqueuePurgeTags(ctx, entryPurgeTags("post", 8));
    await flush();

    expect(deferred).toHaveLength(1);
    assertOnlyPurged(cdn, ["/post", "/post/9", "/post/8"]);
  });

  // Core derives contexts by spreading and the flush reads the outermost one,
  // so a derived context must share the same set.
  it("flushes tags enqueued against a derived context", async () => {
    const { ctx, cdn, flush } = await fakeCtx();
    const derived = withUser(ctx, {
      id: 1,
      email: "u@cms.example",
      role: "admin",
      meta: {},
    });

    enqueuePurgeTags(derived, entryPurgeTags("post", 9));
    await flush();

    assertOnlyPurged(cdn, ["/post", "/post/9"]);
  });

  it("does nothing on flush when nothing was enqueued", async () => {
    const { cdn, deferred, flush } = await fakeCtx();
    await flush();
    expect(deferred).toHaveLength(0);
    assertOnlyPurged(cdn, []);
  });

  it("is inert when no cdn is configured", async () => {
    const { ctx, deferred, flush } = await fakeCtx("absent");
    enqueuePurgeTags(ctx, entryPurgeTags("post", 9));
    await flush();
    expect(deferred).toHaveLength(0);
  });

  // A vendor that cannot invalidate by tag has no `purgeTags` at all, which is
  // the point of its being optional: nothing can call it and report success.
  it("is inert when the provider cannot purge by tag", async () => {
    const { ctx, cdn, deferred, flush } = await fakeCtx("cannot-purge");
    enqueuePurgeTags(ctx, entryPurgeTags("post", 9));
    await flush();
    expect(deferred).toHaveLength(0);
    assertOnlyPurged(cdn, []);
  });
});

describe("registerCorePurgeInvalidator", () => {
  // Loose-typed: each action's payload differs, so the tests fire by name.
  const fire = (hooks: HookRegistry, name: string, ...args: unknown[]) =>
    (hooks.doAction as (n: string, ...a: unknown[]) => Promise<void>).call(
      hooks,
      name,
      ...args,
    );

  const entry = { id: 9, type: "post" };
  const changes = { set: {}, removed: [] };
  const ENTRY_EVENTS: readonly (readonly [string, readonly unknown[]])[] = [
    ["entry:published", [entry]],
    ["entry:updated", [entry, entry]],
    ["entry:meta_changed", [entry, changes]],
    ["entry:trashed", [entry]],
    ["entry:restored", [entry]],
    ["entry:deleted", [entry]],
  ];

  it.each(ENTRY_EVENTS)(
    "%s purges the entry's pages and its type's",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, cdn, flush } = await fakeCtx();

      await fire(hooks, event, ...payload, ctx);
      await flush();

      assertOnlyPurged(cdn, ["/post", "/post/9"]);
    },
  );

  // Any public entry can render its author — a hierarchical `page` permalink
  // included — so every public type is purged; only the private `note` is not.
  it("user:updated purges the pages of every public entry type", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, cdn, flush } = await fakeCtx();
    const user = { id: 4, name: "Jane", slug: "jane" };

    await fire(hooks, "user:updated", user, user, ctx);
    await flush();

    assertOnlyPurged(cdn, ["/post", "/page"]);
  });

  // Deleting a user reassigns their entries without firing an entry action, so
  // their cached author feed and every page showing those entries stay stale.
  it("user:deleted purges the pages of every public entry type", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, cdn, flush } = await fakeCtx();
    const user = { id: 4, name: "Jane", slug: "jane" };

    await fire(hooks, "user:deleted", user, { reassignedTo: 1 }, ctx);
    await flush();

    assertOnlyPurged(cdn, ["/post", "/page"]);
  });

  const term = { id: 3, taxonomy: "category" };
  const TERM_EVENTS: readonly (readonly [string, readonly unknown[]])[] = [
    ["term:created", [term]],
    ["term:updated", [term, term]],
    ["term:meta_changed", [term, changes]],
    ["term:deleted", [term]],
  ];

  it.each(TERM_EVENTS)(
    "%s purges the pages of the taxonomy's entry types",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, cdn, flush } = await fakeCtx();

      await fire(hooks, event, ...payload, ctx);
      await flush();

      assertOnlyPurged(cdn, ["/post"]);
    },
  );

  // A taxonomy that lists no entry types still has term feeds, which list every
  // public type attached to the term — so its term changes purge those types.
  it.each(TERM_EVENTS)(
    "%s in a taxonomy without entryTypes purges the public types' pages",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, cdn, flush } = await fakeCtx();
      const untyped = payload.map((arg) =>
        arg === term ? { ...term, taxonomy: "tag" } : arg,
      );

      await fire(hooks, event, ...untyped, ctx);
      await flush();

      assertOnlyPurged(cdn, ["/post", "/page"]);
    },
  );

  // A page that printed a settings group is stored under its tag, so saving
  // the group has to reach the CDN, not only this request's memo.
  it("settings:group_changed purges the pages that printed the group", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, cdn, flush } = await fakeCtx();

    await fire(hooks, "settings:group_changed", { group: "site" }, ctx);
    await flush();

    assertOnlyPurged(cdn, ["/settings/site"]);
  });

  const jane = { id: 4, name: "Jane", slug: "jane" };
  const PURGING_EVENTS: readonly (readonly [string, readonly unknown[]])[] = [
    ...ENTRY_EVENTS,
    ...TERM_EVENTS,
    ["user:updated", [jane, jane]],
    ["user:deleted", [jane, { reassignedTo: 1 }]],
    ["settings:group_changed", [{ group: "site" }]],
  ];

  // A memo that loads each key on a miss and records which keys it loaded.
  function recordingMemo(ctx: AppContext) {
    const loads: string[] = [];
    const read = (key: string, tags?: readonly string[]) =>
      ctx.memo(
        key,
        () => {
          loads.push(key);
          return Promise.resolve(key);
        },
        tags,
      );
    return { loads, read };
  }

  // Every tag a stored page carries, less the memo-only user tag.
  const STORED_TAGS = Object.entries(PAGES).filter(
    ([, tag]) => tag !== userTag(jane.id),
  );

  // The memo drop is read off the purge itself, so the two cannot drift into
  // separate lists, and it applies even with no cdn.
  it.each(PURGING_EVENTS)(
    "%s drops the memo entries tagged with what it purges",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const purging = await fakeCtx();
      await fire(hooks, event, ...payload, purging.ctx);
      await purging.flush();
      const purged: string[] = [];
      for (const [path, tag] of STORED_TAGS) {
        const request = new Request(`https://cms.example${path}`);
        if (!(await purging.cdn.store.match(request))) purged.push(tag);
      }
      const { ctx } = await fakeCtx("absent");
      const { loads, read } = recordingMemo(ctx);
      for (const [, tag] of STORED_TAGS) await read(tag, [tag]);
      await read("untagged");
      loads.length = 0;

      await fire(hooks, event, ...payload, ctx);
      for (const [, tag] of STORED_TAGS) await read(tag, [tag]);
      await read("untagged");

      expect(purged).not.toHaveLength(0);
      expect(loads).toEqual(purged);
    },
  );

  // A tag no page is stored under: the memo drops it, the CDN never hears.
  it.each([
    ["user:updated", [jane, jane], userTag(jane.id)],
    ["user:deleted", [jane, { reassignedTo: 1 }], userTag(jane.id)],
  ] as const)(
    "%s drops its memo-only tag without purging it",
    async (event, payload, tag) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, cdn, flush } = await fakeCtx();
      const { loads, read } = recordingMemo(ctx);
      await read("own", [tag]);
      loads.length = 0;

      await fire(hooks, event, ...payload, ctx);
      await read("own", [tag]);
      await flush();

      expect(loads).toEqual(["own"]);
      cdn.assertStored("/author/4");
    },
  );

  it("batches a bulk publish into one purge", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, cdn, deferred, flush } = await fakeCtx();

    await fire(hooks, "entry:published", { id: 9, type: "post" }, ctx);
    await fire(hooks, "entry:published", { id: 8, type: "post" }, ctx);
    await flush();

    expect(deferred).toHaveLength(1);
    assertOnlyPurged(cdn, ["/post", "/post/9", "/post/8"]);
  });
});
