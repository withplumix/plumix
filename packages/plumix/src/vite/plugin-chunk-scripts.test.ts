import { describe, expect, test } from "vitest";

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

/** What the browser fetches: each URL against the dispatcher's `<base href>`. */
function resolvedPluginUrls(html: string, baseHref: string): string[] {
  const urls = [
    ...html.matchAll(/data-plumix-plugin="[^"]*" (?:src|href)="([^"]*)"/g),
  ].map((m) => m[1] ?? "");
  const base = new URL(baseHref, "https://site.test/deep/link");
  return urls.map((url) => new URL(url, base).pathname);
}

describe("injectPluginChunkScripts", () => {
  test("under a basePath, every plugin chunk and stylesheet resolves under the mount", () => {
    const html = injectPluginChunkScripts(SHELL, CHUNKS);

    expect(resolvedPluginUrls(html, "/cms/_plumix/admin/")).toEqual([
      "/cms/_plumix/admin/plugins/hello.css",
      "/cms/_plumix/admin/plugins/hello.js",
      "/cms/_plumix/admin/plugins/site-bundle.css",
      "/cms/_plumix/admin/plugins/site-bundle.js",
    ]);
  });

  test("at the domain root, plugin chunks and stylesheets resolve where they always have", () => {
    const html = injectPluginChunkScripts(SHELL, CHUNKS);

    expect(resolvedPluginUrls(html, "/_plumix/admin/")).toEqual([
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
});
