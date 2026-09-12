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

  test("exports what an embedder reaches for, and serves only when run", () => {
    expect(source).toContain("export default site.handler;");
    expect(source).toContain("export const listener = site.listener;");
    expect(source).toContain("export const startCron = site.startCron;");
    // A host embedding `listener` owes the site a drain on its own shutdown.
    expect(source).toContain("export const dispose = site.dispose;");
    expect(source).toContain("site.serveWhenMain(import.meta.main);");
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
