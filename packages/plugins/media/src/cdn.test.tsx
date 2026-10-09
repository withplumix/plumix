import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness, memoryCdn } from "plumix/test";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";
import { describe, expect, test } from "vitest";

import { media as mediaField } from "./builder.js";
import { media } from "./index.js";

// A post that shows a cover image through a media reference field.
const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerEntryMetaBox("cover", {
    label: "Cover",
    entryTypes: ["post"],
    fields: [mediaField("cover")],
  });
});

const theme = defineTheme({
  templates: [
    entry(
      defineTemplate({ render: ({ data }) => <h1>{data.entry.title}</h1> }),
    ),
    fallback(() => null),
  ],
});

interface Site {
  readonly h: DispatcherHarness;
  readonly stored: (path: string) => readonly string[] | undefined;
  readonly admin: User;
  readonly mediaId: number;
}

async function site(): Promise<Site> {
  const { cdn, stored } = memoryCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: { plugins: [media(), blog], theme },
  });
  const admin = await h.seedUser("admin");
  const cover = await h.factory.entry.create({
    type: "media",
    slug: "cover",
    title: "Cover",
    status: "published",
    authorId: admin.id,
    meta: { storageKey: "cover.png", mime: "image/png", size: 1, alt: "" },
  });
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    status: "published",
    authorId: admin.id,
    publishedAt: new Date(),
    meta: { cover: String(cover.id) },
  });
  const response = await h.dispatch(
    new Request("https://cms.example/post/hello"),
  );
  expect(response.status).toBe(200);
  await h.drainDeferred();
  expect(stored("/post/hello")).toBeDefined();
  return { h, stored, admin, mediaId: cover.id };
}

async function rpc(s: Site, procedure: string, input: unknown): Promise<void> {
  const response = await s.h.fetch(`/_plumix/rpc/media/${procedure}`, {
    as: s.admin,
    json: { json: input },
  });
  response.assertStatus(200);
  await s.h.drainDeferred();
}

describe("@plumix/plugin-media — CDN", () => {
  test("editing a media item retires the pages that showed it", async () => {
    const s = await site();

    await rpc(s, "update", { id: s.mediaId, alt: "A cover" });

    expect(s.stored("/post/hello")).toBeUndefined();
  });

  test("deleting a media item retires the pages that showed it", async () => {
    const s = await site();

    await rpc(s, "delete", { id: s.mediaId });

    expect(s.stored("/post/hello")).toBeUndefined();
  });
});
