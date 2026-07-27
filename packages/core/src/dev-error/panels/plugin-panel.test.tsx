import { afterEach, describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../../test/dispatcher.js";
import { definePlugin } from "../../plugin/define.js";
import { fallback } from "../../route/render/template-builders.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { defineTheme } from "../../theme.js";

// A public `post` type so `/post/hello` resolves and renders through the
// (throwing) theme — the seam that drives the dispatcher's dev error path.
const postType = {
  label: "Posts",
  isPublic: true,
  hasArchive: true,
} as const;

// A plugin panel author's happy path on the dev error page: contribute a panel
// through `error_page:panels`, reading off the caught error, and it renders as
// its own section on the 500 page.
const demoPlugin = definePlugin("error-panel-demo", (ctx) => {
  ctx.registerEntryType("post", postType);
  ctx.addFilter("error_page:panels", (panels) => [
    ...panels,
    {
      id: "error-panel-demo",
      title: "Demo",
      order: 50,
      render: (caught) => (
        <p>caught {caught instanceof Error ? caught.message : "unknown"}</p>
      ),
    },
  ]);
});

// The same route seam without the panel contribution.
const barePlugin = definePlugin("error-panel-bare", (ctx) => {
  ctx.registerEntryType("post", postType);
});

const boomTheme = defineTheme({
  templates: [
    fallback(() => {
      throw new Error("template blew up");
    }),
  ],
});

async function seedAndRender(h: DispatcherHarness): Promise<Response> {
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
  return h.dispatch(new Request("https://cms.example/post/hello"));
}

describe("dev error page plugin panel", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("a plugin panel renders as a section on the dev 500 page", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [demoPlugin],
      theme: boomTheme,
    });

    const res = await seedAndRender(h);
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).toContain(
      'data-testid="plumix-dev-error-panel-error-panel-demo"',
    );
    expect(html).toContain("Demo");
    // The panel read the caught error off the filter's error argument.
    expect(html).toContain("caught template blew up");
  });

  test("no panel section renders when no plugin contributes one", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [barePlugin],
      theme: boomTheme,
    });

    const res = await seedAndRender(h);
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).not.toContain('data-testid="plumix-dev-error-panels"');
  });
});
