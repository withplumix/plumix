import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

const theme = defineTheme({ templates: [fallback(() => null)] });

describe("debug bar App panel + Request auth (end to end)", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("shows installed plugins, registered content types, and anonymous auth", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });

    const res = await h.dispatch(new Request("https://cms.example/nope"));
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('data-testid="plumix-debug-panel-app"');
    expect(html).toContain("blog"); // installed plugin id
    expect(html).toContain("post"); // registered entry type
    expect(html).toContain("anonymous"); // Request panel's Auth section
  });
});
