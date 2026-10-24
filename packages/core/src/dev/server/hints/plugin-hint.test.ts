import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../../../plugin/define.js";
import { fallback } from "../../../route/render/template-builders.js";
import {
  createDispatcherHarness,
  DEV_ORIGIN,
} from "../../../test/dispatcher.js";
import { defineTheme } from "../../../theme.js";

const demoPlugin = definePlugin("error-hint-demo", {
  setup: (ctx) => {
    ctx.registerErrorHint({
      id: "posts-table",
      matches: (caught) =>
        caught instanceof Error && caught.message.includes("posts"),
      title: "Create the posts table",
      body: "The blog's initial migration has not been applied.",
      docs: [{ label: "Migrations", href: "https://plumix.dev/migrations" }],
    });
    ctx.registerErrorHint({
      id: "comments-table",
      matches: (caught) =>
        caught instanceof Error && caught.message.includes("comments"),
      title: "Create the comments table",
    });
  },
});

/**
 * Recognized by core's `no such table` matcher too, so the page carries both
 * hints and their order is a claim worth asserting.
 */
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

  test("a plugin hint that matches renders in the how-to-fix card, after core's", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      config: { plugins: [demoPlugin], theme: boomTheme },
    });

    const res = await h.dispatch(new Request(`${DEV_ORIGIN}/`));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).toContain('data-testid="plumix-dev-error-hint"');
    expect(html).toContain("https://plumix.dev/migrations");
    expect(html.indexOf("Run your migrations")).toBeGreaterThan(-1);
    expect(html.indexOf("Run your migrations")).toBeLessThan(
      html.indexOf("Create the posts table"),
    );
  });

  test("a plugin hint that does not match the error is left off the page", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      config: { plugins: [demoPlugin], theme: boomTheme },
    });

    const res = await h.dispatch(new Request(`${DEV_ORIGIN}/`));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html).not.toContain("Create the comments table");
  });

  test("a runtime adapter's hint renders after core's and before a plugin's", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness({
      config: {
        plugins: [demoPlugin],
        theme: boomTheme,
        runtime: {
          name: "edge",
          handler: {},
          generateEntry: () => "",
          errorHints: [
            {
              id: "edge-binding",
              matches: (caught) => caught instanceof Error,
              title: "Declare the edge binding",
            },
          ],
        },
      },
    });

    const res = await h.dispatch(new Request(`${DEV_ORIGIN}/`));
    const html = await res.text();

    expect(res.status).toBe(500);
    expect(html.indexOf("Run your migrations")).toBeLessThan(
      html.indexOf("Declare the edge binding"),
    );
    expect(html.indexOf("Declare the edge binding")).toBeLessThan(
      html.indexOf("Create the posts table"),
    );
  });
});
