import { afterEach, describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { DebugSection, DebugTable } from "./primitives.js";

// A plugin panel author's happy path: record per-request data during render,
// then read it back when the panel renders. `render:document` fires during a
// real page render (before the bar), so the entry is present by panel time.
const demoPlugin = definePlugin("debug-demo", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.addFilter("render:document", (manifest, _data, appCtx) => {
    appCtx.telemetry.record("debug-demo", { note: "recorded during render" });
    return manifest;
  });
  ctx.addFilter("debug_bar:panels", (panels) => [
    ...panels,
    {
      id: "debug-demo",
      title: "Demo",
      order: 50,
      render: (appCtx) => (
        <DebugSection title="Demo">
          <DebugTable
            headers={["note"]}
            rows={appCtx.telemetry
              .get("debug-demo")
              .map((r) => [String((r.data as { note: string }).note)])}
          />
        </DebugSection>
      ),
    },
  ]);
});

const theme = defineTheme({ templates: [fallback(() => null)] });

async function seedAndRender(h: DispatcherHarness): Promise<string> {
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
  const res = await h.dispatch(new Request("https://cms.example/post/hello"));
  return res.text();
}

describe("debug bar plugin panel", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("a plugin records during a request and its panel shows the data", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({ plugins: [demoPlugin], theme });

    const html = await seedAndRender(h);

    expect(html).toContain('data-testid="plumix-debug-panel-debug-demo"');
    expect(html).toContain("recorded during render");
  });

  test("disabling the panel removes both its render and its data", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [demoPlugin],
      theme,
      debugBar: { disable: ["debug-demo"] },
    });

    const html = await seedAndRender(h);

    expect(html).not.toContain('data-testid="plumix-debug-panel-debug-demo"');
    expect(html).not.toContain("recorded during render");
  });
});
