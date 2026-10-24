import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const PUBLIC_PAGES = [
  ["a published entry", "/post/hello", 200],
  ["an archive", "/post", 200],
  ["a search results page", "/search/hello", 200],
  ["a missing page", "/nowhere", 404],
] as const;

let h: DispatcherHarness;

beforeEach(async () => {
  h = await createDispatcherHarness({ config: { plugins: [blog] } });
  const author = await h.seedUser("admin");
  await h.factory.published.create({
    type: "post",
    slug: "hello",
    title: "hello",
    authorId: author.id,
  });
});

describe("an anonymous visitor on a public page", () => {
  test.each(PUBLIC_PAGES)("%s sets no cookie", async (_name, path, status) => {
    const response = await h.fetch(path);

    response.assertStatus(status);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("a site that configures no outbound slot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each(PUBLIC_PAGES)("%s sends nothing anywhere", async (_name, path) => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchSpy);

    await h.fetch(path);
    await h.drainDeferred();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
