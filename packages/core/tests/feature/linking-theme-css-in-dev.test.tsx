import { afterAll, afterEach, beforeEach, describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

function themeLinking(themeCss: readonly string[]) {
  return defineTheme({
    templates: [
      fallback(() => null),
      entry(({ data }) => <article>{data.entry.title}</article>),
    ],
    document: { link: [{ rel: "icon", href: "/favicon.svg" }] },
    css: [...themeCss],
  });
}

/**
 * `buildApp` reads the dev gate as it boots, and the render reads it again, so
 * each site boots under the gate its tests then render under.
 */
const original = process.env.PLUMIX_DEV;
function restoreDevGate(): void {
  if (original === undefined) delete process.env.PLUMIX_DEV;
  else process.env.PLUMIX_DEV = original;
}

process.env.PLUMIX_DEV = "1";
const relativeCssSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: themeLinking(["./theme/app.css"]) },
});
const aliasedCssSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: themeLinking(["~/aliased.css", "@acme/ui/style.css"]) },
});
delete process.env.PLUMIX_DEV;
const builtSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: themeLinking(["./theme/app.css"]) },
});
restoreDevGate();

afterAll(restoreDevGate);

describe("dev theme CSS is linked in <head> to avoid FOUC (#1701)", () => {
  describe("in serve mode", () => {
    beforeEach(() => {
      process.env.PLUMIX_DEV = "1";
    });
    afterEach(restoreDevGate);

    test("a render-blocking <link> AND the HMR client-entry script both ship", async () => {
      const post = await relativeCssSite.factory.published.create({
        type: "post",
        slug: "fouc",
        title: "FOUC",
      });

      const page = await relativeCssSite.visit(post);

      // The blocking <link> paints the first frame styled...
      page.assertSeeInOrder([
        "<head>",
        '<link rel="stylesheet" href="/theme/app.css" />',
        "</head>",
      ]);
      // ...and the client-entry <script> stays for dev tools + CSS HMR.
      page.assertSeeInOrder([
        "<head>",
        '<script type="module" src="/.plumix/client-entry.ts"></script>',
        "</head>",
      ]);
      // The dev CSS link follows the theme's own link[] so it wins the cascade.
      page.assertSeeInOrder([
        '<link rel="icon"',
        '<link rel="stylesheet" href="/theme/app.css"',
      ]);
    });

    test("aliased / npm-scope specifiers get no <link> (they ride the script)", async () => {
      const post = await aliasedCssSite.factory.published.create({
        type: "post",
        slug: "fouc",
        title: "FOUC",
      });

      const page = await aliasedCssSite.visit(post);

      page.assertDontSee('<link rel="stylesheet"');
      // Still loaded via the client-entry import, unchanged from before.
      page.assertSeeInOrder([
        "<head>",
        '<script type="module" src="/.plumix/client-entry.ts"></script>',
        "</head>",
      ]);
    });
  });

  describe("in build mode", () => {
    beforeEach(() => {
      delete process.env.PLUMIX_DEV;
    });
    afterEach(restoreDevGate);

    test("no dev <link> — prod links the hashed CSS from the manifest", async () => {
      const post = await builtSite.factory.published.create({
        type: "post",
        slug: "fouc",
        title: "FOUC",
      });

      const page = await builtSite.visit(post);

      page.assertDontSee('<link rel="stylesheet" href="/theme/app.css" />');
    });
  });
});
