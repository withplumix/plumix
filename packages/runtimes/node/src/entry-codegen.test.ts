import { describe, expect, test } from "vitest";

import { node } from "./adapter.js";

function entry(configModule: string): string {
  return node().generateEntry({ configModule });
}

describe("node generateEntry", () => {
  const source = entry("./config.ts");

  test("imports the user config from the configured module specifier, escaped", () => {
    expect(entry("../plumix.config.ts")).toContain(
      'import config from "../plumix.config.ts";',
    );
    expect(entry("./path with spaces/config.ts")).toContain(
      'import config from "./path with spaces/config.ts";',
    );
  });

  test("threads the virtual modules into the site the package ships", () => {
    expect(source).toContain(
      'import { createNodeSite } from "@plumix/runtime-node";',
    );
    expect(source).toContain(
      'import assetManifest from "virtual:plumix/asset-manifest";',
    );
    expect(source).toContain('export * from "virtual:plumix/worker-exports";');
    expect(source).toContain("const site = createNodeSite({");
    expect(source).toContain("  config,");
    expect(source).toContain("  assetManifest,");
    // `dist/client` sits beside the entry, so only the entry can say where.
    expect(source).toContain("  entryUrl: import.meta.url,");
    expect(source).not.toContain("import.meta.env");
  });

  test("exports what an embedder reaches for", () => {
    expect(source).toContain("export default site.handler;");
    expect(source).toContain("export const listener = site.listener;");
    expect(source).toContain("export const startCron = site.startCron;");
    expect(source).toContain("export const dispose = site.dispose;");
  });

  test("serves only when the entry is the process, and starts nothing on import", () => {
    expect(source).toContain("site.serveWhenMain(import.meta.main);");
    // A bare `site.startCron();` or `site.dispose();` would act on import and
    // slip past the logic check below: each is a call, with no keyword and no
    // arrow.
    const before = source.slice(0, source.indexOf("site.serveWhenMain("));
    expect(before).not.toContain("startCron(");
    expect(before).not.toContain("dispose(");
  });

  test("holds imports and calls, and no logic of its own", () => {
    // Past the imports, so a project path carrying `catch` or `for` cannot
    // fail this for a reason that has nothing to do with the entry.
    const body = source.slice(source.indexOf("export *"));
    expect(body).not.toMatch(
      /\b(if|else|for|while|switch|try|catch|function|async|await)\b/,
    );
    expect(body).not.toContain("=>");
  });
});
