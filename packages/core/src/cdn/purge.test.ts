import { beforeAll, describe, expect, it } from "vitest";

import type { AppContext, Db } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import type { CdnFake } from "../test/cdn-fake.js";
import { withUser } from "../auth/with-user.js";
import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { toggle } from "../plugin/fields/toggle.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import {
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "../plugin/registry.js";
import { resolveListingPage } from "../route/render/page-data.js";
import { sweepUnsettledMeta } from "../rpc/procedures/meta/sweep.js";
import { fakeCdn } from "../test/cdn-fake.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createTestDb } from "../test/harness.js";
import { photoProfilePlugin } from "../test/photo-lookup.js";
import { currentUserEtag } from "../test/user-etag.js";
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
  // The RPC handler's graph loads on the first RPC, ~800ms cold; loading it
  // here keeps that out of a test.
  await import("../rpc/build-handler.js");
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
  const kept = Object.keys(PAGES).filter((path) => !purged.includes(path));
  purged.forEach((path) => {
    cdn.assertNotStored(path);
  });
  kept.forEach((path) => {
    cdn.assertStored(path);
  });
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
  function connectedCdn() {
    if (cdnMode === "absent") return undefined;
    if (cdnMode === "cannot-purge") return withoutPurge;
    return cdn;
  }
  const ctx = createTestContext({
    db,
    cdn: connectedCdn(),
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
    ["user:meta_changed", [jane, changes]],
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

  const STORED_TAGS = Object.entries(PAGES);

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

// Each test renders a public page into the cdn, makes the write a real caller
// makes, and asserts what is still stored.
describe("a write to a user", () => {
  const blog = definePlugin("test-user-purge", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerUserMetaBox("newsletter", {
      label: "Newsletter",
      fields: [toggle("newsletter")],
    });
    // A plugin page printing an author it resolved by id, not by slug.
    ctx.registerPublicRoute({
      path: "/byline/:id",
      cacheable: true,
      handler: async (request, appCtx) => {
        const id = Number(new URL(request.url).pathname.split("/").pop());
        const page = await resolveListingPage(appCtx, { kind: "author", id });
        if (page === null || !("author" in page.data)) {
          return new Response(null, { status: 404 });
        }
        return new Response(page.data.author.name);
      },
    });
    // Stands in for `plumix meta settle`, which runs the same sweep.
    ctx.registerRoute({
      method: "POST",
      path: "/settle",
      auth: "authenticated",
      handler: async (_request, appCtx) => {
        await sweepUnsettledMeta(appCtx, { write: true });
        return new Response(null, { status: 204 });
      },
    });
  });

  async function site() {
    const cdn = fakeCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [blog, photoProfilePlugin] },
    });
    const admin = await h.seedUser("admin");
    const [before, after] = await Promise.all([
      h.factory.entry.create({ type: "post", authorId: admin.id }),
      h.factory.entry.create({ type: "post", authorId: admin.id }),
    ]);
    const jane = await h.factory.author.create({
      name: "Jane",
      slug: "jane",
      meta: { portrait: String(before.id) },
    });
    const post = (slug: string, authorId: number) =>
      h.factory.entry.create({
        type: "post",
        slug,
        title: slug,
        status: "published",
        authorId,
        publishedAt: new Date(),
      });
    const render = async (path: string) => {
      (await h.fetch(path)).assertStatus(200);
      await h.drainDeferred();
      cdn.assertStored(path);
    };
    const rpc = async (
      path: string,
      json: Record<string, unknown>,
      as: User = admin,
    ) => {
      const response = await h.fetch(`/_plumix/rpc/${path}`, {
        as,
        json: { json, meta: [] },
      });
      response.assertStatus(200);
      await h.drainDeferred();
    };
    return { h, cdn, admin, jane, photo: after, post, render, rpc };
  }

  it("a meta-only save of an author purges an entry page showing them", async () => {
    const { h, cdn, jane, photo, post, render, rpc } = await site();
    await post("by-jane", jane.id);
    await render("/post/by-jane");

    await rpc("user/update", {
      id: jane.id,
      ifMatch: await currentUserEtag(h.db, jane.id),
      meta: { portrait: String(photo.id) },
    });

    cdn.assertNotStored("/post/by-jane");
  });

  it("an author's locale change purges an entry page showing them", async () => {
    const { cdn, jane, post, render, rpc } = await site();
    await post("by-jane", jane.id);
    await render("/post/by-jane");

    await rpc("user/setLocale", { code: "en" }, jane);

    cdn.assertNotStored("/post/by-jane");
  });

  it("a read that heals an author's meta purges an entry page showing them", async () => {
    const { h, cdn, jane, post, render, rpc } = await site();
    await h.db
      .update(users)
      .set({ meta: { newsletter: "true" } })
      .where(eq(users.id, jane.id));
    await post("by-jane", jane.id);
    await render("/post/by-jane");

    await rpc("user/get", { id: jane.id });

    cdn.assertNotStored("/post/by-jane");
  });

  it("a meta sweep that rewrites an author's meta purges an entry page showing them", async () => {
    const { h, cdn, admin, jane, post, render } = await site();
    await h.db
      .update(users)
      .set({ meta: { newsletter: "true" } })
      .where(eq(users.id, jane.id));
    await post("by-jane", jane.id);
    await render("/post/by-jane");

    const settled = await h.fetch("/_plumix/test-user-purge/settle", {
      method: "POST",
      as: admin,
    });
    settled.assertStatus(204);
    await h.drainDeferred();

    cdn.assertNotStored("/post/by-jane");
  });

  it.each([
    [
      "a meta-only save",
      (photo: number) => ({ meta: { portrait: String(photo) } }),
    ],
    ["a profile save", () => ({ name: "Janet" })],
  ] as const)(
    "%s of an author keeps an entry page by a different author stored",
    async (_save, changes) => {
      const { h, cdn, admin, jane, photo, post, render, rpc } = await site();
      await post("by-jane", jane.id);
      await post("by-admin", admin.id);
      await render("/post/by-jane");
      await render("/post/by-admin");

      await rpc("user/update", {
        id: jane.id,
        ifMatch: await currentUserEtag(h.db, jane.id),
        ...changes(photo.id),
      });

      cdn.assertNotStored("/post/by-jane");
      cdn.assertStored("/post/by-admin");
    },
  );

  it("a profile save of an author purges a page that resolved them by id", async () => {
    const { h, cdn, jane, render, rpc } = await site();
    await render(`/byline/${String(jane.id)}`);

    await rpc("user/update", {
      id: jane.id,
      ifMatch: await currentUserEtag(h.db, jane.id),
      name: "Janet",
    });

    cdn.assertNotStored(`/byline/${String(jane.id)}`);
  });
});
