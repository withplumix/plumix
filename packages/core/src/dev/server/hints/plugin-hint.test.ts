import { afterEach, describe, expect, test } from "vitest";

import type { DevErrorHint } from "../../../index.js";
import { definePlugin } from "../../../plugin/define.js";
import { fallback } from "../../../route/render/template-builders.js";
import { createDispatcherHarness } from "../../../test/dispatcher.js";
import { defineTheme } from "../../../theme.js";

// A hint author's happy path: recognize the caught error and prepend a hint
// more specific than the one core's own matcher contributes for it. Core
// subscribes at priority 10 and appends, so a plugin's default-priority
// subscriber runs after and can place itself first.
const demoPlugin = definePlugin("error-hint-demo", (ctx) => {
  ctx.addFilter("error_page:hints", (hints, caught) => {
    if (!(caught instanceof Error) || !caught.message.includes("posts")) {
      return hints;
    }
    const hint: DevErrorHint = {
      title: "Create the posts table",
      body: "The blog's initial migration has not been applied.",
      docs: [{ label: "Migrations", href: "https://plumix.dev/migrations" }],
    };
    return [hint, ...hints];
  });
});

// Recognized by core's `no such table` matcher too, so the page carries both
// hints and their order is a claim worth asserting.
const boomTheme = defineTheme({
  templates: [
    fallback(() => {
      throw new Error("D1_ERROR: no such table: posts: SQLITE_ERROR");
    }),
  ],
});

describe("dev error page plugin hint", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("a plugin hint renders in the how-to-fix card, above core's", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      plugins: [demoPlugin],
      theme: boomTheme,
    });

    const res = await h.dispatch(new Request("https://cms.example/"));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).toContain('data-testid="plumix-dev-error-hint"');
    expect(html).toContain("https://plumix.dev/migrations");
    expect(html.indexOf("Create the posts table")).toBeGreaterThan(-1);
    expect(html.indexOf("Create the posts table")).toBeLessThan(
      html.indexOf("Run your migrations"),
    );
  });
});
