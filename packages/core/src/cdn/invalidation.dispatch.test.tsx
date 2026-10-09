import { describe, expect, test } from "vitest";

import type { User } from "../db/schema/users.js";
import type { EntryData } from "../route/contract/resolved-entry.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { text } from "../plugin/fields/builder.js";
import { term } from "../plugin/fields/term.js";
import { entry, fallback } from "../route/render/template-builders.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { memoryCdn } from "../test/memory-cdn.js";
import { defineTheme } from "../theme.js";

// The property ADR 0042 exists for, end to end: a page is stored, a write
// changes something it showed, and the stored page is gone.

const site = definePlugin("site", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerEntryType("page", { label: "Pages", isPublic: true });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    entryTypes: ["post"],
  });
  // A page that shows a category through a reference field, outside the
  // types the taxonomy lists.
  ctx.registerEntryMetaBox("featured", {
    label: "Featured",
    entryTypes: ["page"],
    fields: [term("topic", ["category"])],
  });
  ctx.registerUserMetaBox("profile", {
    label: "Profile",
    fields: [text("tagline")],
  });
});

const theme = defineTheme({
  templates: [
    entry(
      defineTemplate<EntryData>({
        render: ({ data }) => <h1>{data.entry.title}</h1>,
      }),
    ),
    fallback(() => null),
  ],
});

interface Site {
  readonly h: DispatcherHarness;
  readonly stored: (path: string) => readonly string[] | undefined;
  readonly admin: User;
}

async function boot(): Promise<Site> {
  const { cdn, stored } = memoryCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: { plugins: [site], theme },
  });
  const admin = await h.seedUser("admin");
  return { h, stored, admin };
}

async function render(s: Site, path: string): Promise<void> {
  const response = await s.h.dispatch(
    new Request(`https://cms.example${path}`),
  );
  expect(response.status).toBe(200);
  await s.h.drainDeferred();
  expect(s.stored(path)).toBeDefined();
}

async function rpc(s: Site, procedure: string, input: unknown): Promise<void> {
  const response = await s.h.fetch(`/_plumix/rpc/${procedure}`, {
    as: s.admin,
    json: { json: input, meta: [] },
  });
  response.assertStatus(200);
  await s.h.drainDeferred();
}

describe("a write retires the stored pages that read it", () => {
  // `entry.update` fires `entry:updated` only when a column changed, and a
  // terms-only patch changes none: the permalink's terms and the term
  // archives still change.
  test("an entry update that changes only its terms", async () => {
    const s = await boot();
    const news = await s.h.factory.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    const post = await s.h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      status: "published",
      authorId: s.admin.id,
      publishedAt: new Date(),
    });
    await render(s, "/post/hello");

    await rpc(s, "entry/update", {
      id: post.id,
      terms: { category: [news.id] },
    });

    expect(s.stored("/post/hello")).toBeUndefined();
  });

  // A save that changes only meta skips `user:updated`, and a public page
  // still prints what the author's meta holds.
  test("a user save that changes only meta", async () => {
    const s = await boot();
    const jane = await s.h.factory.author.create({
      name: "Jane",
      slug: "jane",
    });
    await s.h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      status: "published",
      authorId: jane.id,
      publishedAt: new Date(),
    });
    await render(s, "/post/hello");

    await rpc(s, "user/update", { id: jane.id, meta: { tagline: "Writer" } });

    expect(s.stored("/post/hello")).toBeUndefined();
  });

  // A term write reaches its taxonomy's types; a page of another type that
  // showed the term through a reference field is reached by the term itself.
  test("a term rename, on a page of another type that referenced it", async () => {
    const s = await boot();
    const news = await s.h.factory.term.create({
      taxonomy: "category",
      slug: "news",
      name: "News",
    });
    await s.h.factory.entry.create({
      type: "page",
      slug: "about",
      title: "About",
      status: "published",
      authorId: s.admin.id,
      publishedAt: new Date(),
      meta: { topic: String(news.id) },
    });
    await render(s, "/page/about");

    await rpc(s, "term/update", { id: news.id, name: "Headlines" });

    expect(s.stored("/page/about")).toBeUndefined();
  });
});
