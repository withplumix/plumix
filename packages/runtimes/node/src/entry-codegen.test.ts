import { describe, expect, test } from "vitest";

import { node } from "./adapter.js";
import { ASSETS_DIR_ENV } from "./entry-constants.js";

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

  test("keeps the portable default export and builds one handler through the adapter", () => {
    const source = entry("./config.ts");
    expect(source).toContain("const site = {");
    expect(source).toContain("export default site;");
    expect(source).toContain("async fetch(request, invocation");
    expect(source).toContain("async scheduled(event, invocation");
    expect(source).toContain("handler ??= config.runtime.createHandler(app)");
    expect(source).toContain(
      "if (handler.scheduled) await handler.scheduled(event, invocation)",
    );
  });

  test("exports a Connect-style listener that serves assets before the bridge, and serves only under import.meta.main", () => {
    const source = entry("./config.ts");
    expect(source).toContain("export function listener(req, res");
    expect(source).toContain(
      'import { createAssetsLayer, createRequestListener } from "@plumix/runtime-node";',
    );
    expect(source).toContain("assets.serve(req, res, () => bridge(req, res))");
    expect(source).toContain("if (import.meta.main) {");
    expect(source).toContain(`${ASSETS_DIR_ENV}: resolve(`);
  });

  test("threads the virtual modules and the dev boot-error page like the Cloudflare entry", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      'import assetManifest from "virtual:plumix/asset-manifest";',
    );
    expect(source).toContain('export * from "virtual:plumix/worker-exports";');
    expect(source).toContain("buildApp(config, {");
    expect(source).toContain("if (process.env.PLUMIX_DEV)");
    expect(source).toContain("renderDevBootErrorResponse(bootError)");
    expect(source).toContain("throw bootError;");
    expect(source).not.toContain("import.meta.env");
  });
});
