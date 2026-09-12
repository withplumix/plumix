import { describe, expect, test } from "vitest";

import { node } from "./adapter.js";

function entry(configModule: string): string {
  return node().generateEntry({ configModule });
}

describe("node generateEntry", () => {
  test("imports the user config from the configured module specifier, escaped", () => {
    expect(entry("../plumix.config.ts")).toContain(
      'import config from "../plumix.config.ts";',
    );
    expect(entry("./path with spaces/config.ts")).toContain(
      'import config from "./path with spaces/config.ts";',
    );
  });

  test("threads the virtual modules into the site the package ships", () => {
    const source = entry("./config.ts");
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

  test("exports the portable pair, the embeddable listener and the cron starter", () => {
    const source = entry("./config.ts");
    expect(source).toContain("export default site.handler;");
    expect(source).toContain("export const listener = site.listener;");
    expect(source).toContain("export const startCron = site.startCron;");
  });

  test("serves only when the entry is the process, and never on import", () => {
    const source = entry("./config.ts");
    expect(source).toContain("site.serveWhenMain(import.meta.main);");
    // Importing the entry to embed it in Express must start no server and
    // begin no firing, so nothing may run the site above this line.
    const before = source.slice(0, source.indexOf("site.serveWhenMain("));
    expect(before).not.toContain("startCron()");
    expect(before).not.toContain("createServer");
  });

  test("holds imports and calls, never control flow", () => {
    // The house rule this generator broke: orchestration in a generated module
    // is neither type-checked nor linted, which is how the entry came to drop
    // `handler.scheduled`'s report (#2303). Keep it in `createNodeSite`.
    // Past the imports, so a project path carrying `catch` or `for` cannot
    // fail this for a reason that has nothing to do with control flow.
    const source = entry("./config.ts");
    const body = source.slice(source.indexOf("export *"));
    expect(body).not.toMatch(
      /\b(if|else|for|while|switch|try|catch|function|async|await)\b/,
    );
    expect(body).not.toContain("=>");
  });
});
