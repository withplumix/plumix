import { afterEach, describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../../test/dispatcher.js";
import { definePlugin } from "../../plugin/define.js";
import { fallback } from "../../route/render/template-builders.js";
import { createDispatcherHarness, DEV_ORIGIN } from "../../test/dispatcher.js";
import { defineTheme } from "../../theme.js";
import { DebugSection, DebugTable } from "../debug-panels/primitives.js";

// What a plugin shipping a panel writes, spelled against the internal module
// here rather than the `plumix` façade a real plugin augments.
declare module "../debug-panels/config.js" {
  interface DebugPanelRegistry {
    "debug-demo": true;
  }
}

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
  ctx.addFilter("debug:panels", (panels) => [
    ...panels,
    {
      id: "debug-demo",
      title: "Demo",
      order: 50,
      render: (snapshot) => (
        <DebugSection title="Demo">
          <DebugTable
            headers={["note"]}
            rows={(snapshot.records["debug-demo"] ?? []).map((r) => [
              (r.data as { note: string }).note,
            ])}
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
  const res = await h.dispatch(new Request(`${DEV_ORIGIN}/post/hello`));
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

  // A plugin panel is nameable in `dev.panels` only once its plugin declares
  // it — the registry is what makes a mistyped id a compile error rather than
  // a silent no-op, so an undeclared panel simply isn't addressable (#2425).
  test("disabling the panel removes both its render and its data", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [demoPlugin],
      theme,
      dev: { panels: { "debug-demo": false } },
    });

    const html = await seedAndRender(h);

    expect(html).not.toContain('data-testid="plumix-debug-panel-debug-demo"');
    expect(html).not.toContain("recorded during render");
  });
});
