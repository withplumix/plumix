import { describe, expect, test } from "vitest";

import { createDispatcherHarness, plumixRequest } from "@plumix/core/test";

import { injectPluginChunkScripts } from "./plugin-chunk-scripts.js";

const SHELL = "<!doctype html><html><head></head><body></body></html>";

const CHUNKS = [
  { pluginId: "hello", chunkFile: "hello.js", cssFile: "hello.css" },
  {
    pluginId: "site-bundle",
    chunkFile: "site-bundle.js",
    cssFile: "site-bundle.css",
  },
];

/**
 * What the browser fetches: the staged shell served by the dispatcher at a
 * deep link, each plugin URL resolved against the page and its `<base href>`.
 */
async function servedPluginUrls(
  stagedShell: string,
  basePath: string,
): Promise<string[]> {
  const h = await createDispatcherHarness({
    assets: {
      fetch: () =>
        Promise.resolve(
          new Response(stagedShell, {
            headers: { "content-type": "text/html" },
          }),
        ),
    },
    config: { basePath },
  });
  const pageUrl = `http://localhost${basePath}/_plumix/admin/entries/post`;
  const response = await h.dispatch(plumixRequest(pageUrl));
  const html = await response.text();
  const baseHref = /<base href="([^"]*)">/.exec(html)?.[1] ?? "";
  const base = new URL(baseHref, pageUrl);
  return [
    ...html.matchAll(/data-plumix-plugin="[^"]*" (?:src|href)="([^"]*)"/g),
  ].map((m) => new URL(m[1] ?? "", base).pathname);
}

describe("injectPluginChunkScripts", () => {
  test("under a basePath, the served shell's plugin chunks and stylesheets resolve under the mount", async () => {
    const shell = injectPluginChunkScripts(SHELL, CHUNKS);

    expect(await servedPluginUrls(shell, "/cms")).toEqual([
      "/cms/_plumix/admin/plugins/hello.css",
      "/cms/_plumix/admin/plugins/hello.js",
      "/cms/_plumix/admin/plugins/site-bundle.css",
      "/cms/_plumix/admin/plugins/site-bundle.js",
    ]);
  });

  test("at the domain root, the served shell's plugin chunks and stylesheets resolve where they always have", async () => {
    const shell = injectPluginChunkScripts(SHELL, CHUNKS);

    expect(await servedPluginUrls(shell, "")).toEqual([
      "/_plumix/admin/plugins/hello.css",
      "/_plumix/admin/plugins/hello.js",
      "/_plumix/admin/plugins/site-bundle.css",
      "/_plumix/admin/plugins/site-bundle.js",
    ]);
  });

  test("re-staging replaces the plugin block instead of adding a second one", () => {
    const first = injectPluginChunkScripts(SHELL, CHUNKS);

    const restaged = injectPluginChunkScripts(first, CHUNKS);

    expect(restaged).toBe(first);
  });

  test("puts the plugin block just before the closing body tag", () => {
    const html = injectPluginChunkScripts(SHELL, [
      { pluginId: "hello", chunkFile: "hello.js", cssFile: "hello.css" },
      { pluginId: "seo", chunkFile: "seo.js" },
    ]);

    expect(html).toBe(
      [
        "<!doctype html><html><head></head><body><!-- plumix:plugin-chunks -->",
        '<link rel="stylesheet" data-plumix-plugin="hello" href="plugins/hello.css">',
        '<script type="module" data-plumix-plugin="hello" src="plugins/hello.js"></script>',
        '<script type="module" data-plumix-plugin="seo" src="plugins/seo.js"></script>',
        "<!-- /plumix:plugin-chunks -->",
        "</body></html>",
      ].join("\n"),
    );
  });

  test("appends the plugin block to a shell with no closing body tag", () => {
    const html = injectPluginChunkScripts("<div></div>", [
      { pluginId: "seo", chunkFile: "seo.js" },
    ]);

    expect(html).toBe(
      [
        "<div></div>",
        "<!-- plumix:plugin-chunks -->",
        '<script type="module" data-plumix-plugin="seo" src="plugins/seo.js"></script>',
        "<!-- /plumix:plugin-chunks -->",
      ].join("\n"),
    );
  });

  test("a site with no plugin chunks gets an empty block", () => {
    const html = injectPluginChunkScripts("<div></div>", []);

    expect(html).toBe(
      "<div></div>\n<!-- plumix:plugin-chunks -->\n\n<!-- /plumix:plugin-chunks -->",
    );
  });

  test("escapes the plugin id so it cannot break out of its attribute", () => {
    const html = injectPluginChunkScripts("<div></div>", [
      { pluginId: 'a&b"c<d', chunkFile: "x.js" },
    ]);

    expect(html).toContain('data-plumix-plugin="a&amp;b&quot;c&lt;d"');
  });
});
