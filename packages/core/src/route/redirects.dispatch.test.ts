import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { defaultTestTheme } from "../test/default-theme.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

describe("public redirect dispatch", () => {
  test("a plugin-registered redirect is served as a 308 with Location", async () => {
    const harness = await createDispatcherHarness({
      plugins: [
        definePlugin("legacy", (ctx) => {
          ctx.registerRedirects([
            { from: "/old/guide", to: "/guides/start", status: 308 },
          ]);
        }),
      ],
    });
    const response = await harness.fetch("/old/guide");
    response.assertStatus(308);
    expect(response.headers.get("location")).toBe("/guides/start");
  });

  test("a `gone` rule is served as a 410", async () => {
    const harness = await createDispatcherHarness({
      plugins: [
        definePlugin("legacy", (ctx) => {
          ctx.registerRedirects([{ from: "/legacy/*", gone: true }]);
        }),
      ],
    });
    const response = await harness.fetch("/legacy/anything");
    response.assertStatus(410);
  });

  test("a moved static asset redirects instead of 404ing", async () => {
    const harness = await createDispatcherHarness({
      redirects: [{ from: "/img/old-logo.png", to: "/img/new-logo.png" }],
    });
    const response = await harness.fetch("/img/old-logo.png");
    response.assertStatus(301);
    expect(response.headers.get("location")).toBe("/img/new-logo.png");
  });

  test("a site `config.redirects` rule is served", async () => {
    const harness = await createDispatcherHarness({
      redirects: [{ from: "/team/:slug", to: "/about/:slug", status: 301 }],
    });
    const response = await harness.fetch("/team/ada");
    response.assertStatus(301);
    expect(response.headers.get("location")).toBe("/about/ada");
  });

  test("a theme-declared redirect is served", async () => {
    const harness = await createDispatcherHarness({
      theme: {
        ...defaultTestTheme,
        redirects: [{ from: "/post/:slug", to: "/blog/:slug", status: 308 }],
      },
    });
    const response = await harness.fetch("/post/hello");
    response.assertStatus(308);
    expect(response.headers.get("location")).toBe("/blog/hello");
  });

  test("a redirect shadows a published entry at the same path", async () => {
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    });
    const harness = await createDispatcherHarness({
      plugins: [blog],
      redirects: [{ from: "/post/moved", to: "/post/kept", status: 301 }],
    });
    const author = await harness.seedUser("admin");
    for (const slug of ["moved", "kept"]) {
      await harness.factory.entry.create({
        type: "post",
        slug,
        title: slug,
        content: null,
        status: "published",
        authorId: author.id,
        parentId: null,
      });
    }
    // The redirected slug never renders its page — the rule wins ahead of
    // content routing — while an un-redirected sibling still resolves 200.
    (await harness.fetch("/post/moved")).assertStatus(301);
    (await harness.fetch("/post/kept")).assertStatus(200);
  });

  test("config outranks a theme rule for the same path", async () => {
    const harness = await createDispatcherHarness({
      redirects: [{ from: "/dup", to: "/from-config" }],
      theme: {
        ...defaultTestTheme,
        redirects: [{ from: "/dup", to: "/from-theme" }],
      },
    });
    const response = await harness.fetch("/dup");
    expect(response.headers.get("location")).toBe("/from-config");
  });
});
