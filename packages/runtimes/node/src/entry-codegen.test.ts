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

  test("exports a Connect-style listener that serves assets, then image transforms, before the bridge, and serves only under import.meta.main", () => {
    const source = entry("./config.ts");
    expect(source).toContain("export function listener(req, res");
    expect(source).toContain(
      'import { createAssetsLayer, createImageLayer, createRequestListener, startScheduledRunner } from "@plumix/runtime-node";',
    );
    expect(source).toContain(
      "assets.serve(req, res, () => images.serve(req, res, () => bridge(req, res)))",
    );
    expect(source).toContain("createImageLayer(config.imageDelivery, {");
    expect(source).toContain("  assets,");
    expect(source).toContain("  trustProxy,");
    expect(source).toContain(
      "fetch: (request, meta) => site.fetch(request, { env, clientAddress: meta.clientAddress }),",
    );
    // The trust and body-limit options only reach the bridge through here.
    expect(source).toContain(
      "const { trustProxy, bodySizeLimit } = config.runtime.config;",
    );
    expect(source).toContain("{ trustProxy, bodySizeLimit },");
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

describe("node generateEntry — scheduled tasks", () => {
  const source = entry("./plumix.config.ts");

  test("exports a cron starter rather than starting one on import", () => {
    // Importing the entry to embed it in Express must not begin firing tasks.
    expect(source).toContain("export async function startCron(");
    const beforeMain = source.slice(0, source.indexOf("if (import.meta.main)"));
    expect(beforeMain).not.toContain("startCron()");
  });

  test("starts cron after the server is listening, and never blocks on it", () => {
    const listenAt = source.indexOf("server.listen(");
    const startAt = source.indexOf("startCron().then(");
    expect(listenAt).toBeGreaterThan(-1);
    expect(startAt).toBeGreaterThan(listenAt);
    // A build that cannot start cron must not take down a serving process.
    expect(source).toContain("cron failed to start");
  });

  test("honours cron: false, so an external scheduler owns the schedules", () => {
    expect(source).toContain("config.runtime.config.cron !== false");
  });

  test("stops the scheduler before the drain, not during it", () => {
    const stopAt = source.indexOf("await cron?.stop(");
    const disposeAt = source.indexOf("handler.dispose(");
    expect(stopAt).toBeGreaterThan(-1);
    expect(disposeAt).toBeGreaterThan(stopAt);
  });
});

describe("node generateEntry — shutdown ordering", () => {
  const source = entry("./plumix.config.ts");

  test("bounds the scheduler stop by what is left of the drain budget", () => {
    // Unbounded, a multi-minute task in flight would hold SIGTERM open and
    // leave dispose() a zero budget, so the orchestrator SIGKILLs first.
    expect(source).toContain(
      "cron?.stop({ timeoutMs: Math.max(0, deadline - Date.now()) })",
    );
  });

  test("stops a scheduler that finishes starting after the signal landed", () => {
    // buildApp may still be running when SIGTERM arrives; the scheduler must
    // not start behind the shutdown and fire into its drain.
    expect(source).toContain("let stopping = false;");
    expect(source).toContain("if (stopping) void started.stop(");
  });
});
