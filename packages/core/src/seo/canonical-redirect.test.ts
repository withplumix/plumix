import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

async function harness(): Promise<
  Awaited<ReturnType<typeof createDispatcherHarness>>
> {
  const h = await createDispatcherHarness({ plugins: [blogPlugin] });
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello World",
    content: null,
    status: "published",
    authorId: author.id,
  });
  return h;
}

describe("canonical 301 normalization", () => {
  test("a trailing-slash public URL 301s to the slash-less canonical", async () => {
    const h = await harness();
    const res = await h.fetch("/post/hello/");
    res.assertStatus(301);
    expect(res.headers.get("location")).toBe("https://cms.example/post/hello");
  });

  test("an already-canonical URL is served, not redirected", async () => {
    const h = await harness();
    const res = await h.fetch("/post/hello");
    res.assertStatus(200);
    expect(await res.text()).toContain("<h1>Hello World</h1>");
  });

  test("the query string is preserved on the redirect", async () => {
    const h = await harness();
    const res = await h.fetch("/post/hello/?utm=x&ref=y");
    res.assertStatus(301);
    expect(res.headers.get("location")).toBe(
      "https://cms.example/post/hello?utm=x&ref=y",
    );
  });

  test("/page/1 collapses to the bare listing", async () => {
    const h = await harness();
    const res = await h.fetch("/post/page/1");
    res.assertStatus(301);
    expect(res.headers.get("location")).toBe("https://cms.example/post");
  });

  test.each([
    ["robots.txt", "/robots.txt"],
    ["a feed endpoint", "/feed"],
    ["the sitemap", "/sitemap.xml"],
  ])("exempt route %s is not redirected", async (_label, path) => {
    const h = await harness();
    const res = await h.fetch(path);
    expect(res.headers.get("location")).toBeNull();
  });
});
