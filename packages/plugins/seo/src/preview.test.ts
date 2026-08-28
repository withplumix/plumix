import type { JsonValue } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { SerpPreview } from "./serp.js";
import { seo } from "./index.js";
import { SEO_META_KEYS } from "./meta-keys.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
    supports: ["title", "editor", "excerpt"],
  });
});

const theme = defineTheme({ templates: [fallback(() => null)] });

function createHarness(): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [blogPlugin, seo()], theme });
}

async function seedSettings(
  h: DispatcherHarness,
  group: string,
  values: Record<string, JsonValue>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await h.factory.setting.create({ group, key, value });
  }
}

async function seedPost(
  h: DispatcherHarness,
  overrides: {
    readonly excerpt?: string;
    readonly meta?: Record<string, JsonValue>;
  } = {},
): Promise<number> {
  const author = await h.seedUser("admin");
  const entry = await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    ...(overrides.excerpt === undefined ? {} : { excerpt: overrides.excerpt }),
    ...(overrides.meta === undefined ? {} : { meta: overrides.meta }),
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date("2026-05-04T00:00:00.000Z"),
  });
  return entry.id;
}

async function preview(
  h: DispatcherHarness,
  entryId: number,
): Promise<SerpPreview> {
  const admin = await h.seedUser("admin");
  const response = await h.fetch("/_plumix/rpc/seo/preview", {
    as: admin,
    json: { json: { entryId }, meta: [] },
  });
  response.assertStatus(200);
  return (await response.json<{ json: SerpPreview }>()).json;
}

describe("the SERP preview procedure", () => {
  test("answers with the entry's URL, title and derived description", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { title: "Demo", tagline: "A tagline" });
    const id = await seedPost(h, { excerpt: "My excerpt" });

    expect(await preview(h, id)).toEqual({
      url: "https://cms.example/post/hello",
      title: "Hello",
      description: "My excerpt",
      indexable: true,
      reason: "default",
    });
  });

  test("the type's title pattern is what the preview resolves", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { title: "Demo" });
    await seedSettings(h, "seo", {
      "type:post:title": "%%title%% %%sep%% %%sitename%%",
    });
    const id = await seedPost(h);

    expect((await preview(h, id)).title).toBe("Hello · Demo");
  });

  test("with no excerpt the description falls back to the tagline", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { tagline: "A tagline" });
    const id = await seedPost(h);

    expect((await preview(h, id)).description).toBe("A tagline");
  });

  test("a private site is reported as the reason, not the entry", async () => {
    const h = await createHarness();
    await seedSettings(h, "seo", { indexable: false });
    const id = await seedPost(h);

    expect(await preview(h, id)).toMatchObject({
      indexable: false,
      reason: "site_private",
    });
  });

  test("a type held out of search is reported as its own reason", async () => {
    const h = await createHarness();
    await seedSettings(h, "seo", { "type:post:indexable": false });
    const id = await seedPost(h);

    expect(await preview(h, id)).toMatchObject({
      indexable: false,
      reason: "type_default",
    });
  });

  test("the entry's own noindex is left for the editor to overlay", async () => {
    const h = await createHarness();
    const id = await seedPost(h, { meta: { [SEO_META_KEYS.noindex]: true } });

    // The saved flag is deliberately not applied: the editor holds a live
    // toggle for it, and a preview computed from the saved one would
    // contradict what the author is looking at.
    expect(await preview(h, id)).toMatchObject({
      indexable: true,
      reason: "default",
    });
  });

  test("an entry of a type outside the box's scope is not previewable", async () => {
    const h = await createHarness();
    const admin = await h.seedUser("admin");

    const response = await h.fetch("/_plumix/rpc/seo/preview", {
      as: admin,
      json: { json: { entryId: 9999 }, meta: [] },
    });

    response.assertStatus(404);
  });

  test("a signed-out caller gets nothing", async () => {
    const h = await createHarness();
    const id = await seedPost(h);

    const response = await h.fetch("/_plumix/rpc/seo/preview", {
      json: { json: { entryId: id }, meta: [] },
    });

    response.assertStatus(401);
  });
});
