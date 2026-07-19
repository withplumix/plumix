import { describe, expect, test } from "vitest";

import { generateWorkerSource } from "./worker-codegen.js";

describe("generateWorkerSource", () => {
  test("imports the user config from the configured module specifier", () => {
    const source = generateWorkerSource({
      configModule: "../plumix.config.ts",
    });
    expect(source).toContain('import config from "../plumix.config.ts";');
  });

  test("escapes weird specifiers via JSON.stringify", () => {
    const source = generateWorkerSource({
      configModule: "./path with spaces/config.ts",
    });
    expect(source).toContain(
      'import config from "./path with spaces/config.ts";',
    );
  });

  test("leaves the dev-CSRF opt-in to buildApp (worker passes no dev flag)", () => {
    const source = generateWorkerSource({ configModule: "../plumix.config" });
    expect(source).toContain("buildApp(config, {");
    // buildApp derives the opt-in from process.env.PLUMIX_DEV; the worker must
    // not pass it, and must not reference the old vite dev flag at all.
    expect(source).not.toContain("devCsrfLocalhost");
    expect(source).not.toContain("import.meta.env");
  });

  test("exports a fetch handler default export", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("export default");
    expect(source).toContain("async fetch(request, env, ctx)");
  });

  test("reuses a single fetch handler across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("fetchHandler ??=");
  });

  test("exports a scheduled handler that delegates to runtime.buildScheduledHandler", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("async scheduled(event, env, ctx)");
    // Optional-chain so runtimes without scheduled support are a no-op.
    expect(source).toContain("config.runtime.buildScheduledHandler?.(app)");
  });

  test("reuses a single scheduled handler across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("scheduledHandler ??=");
  });

  test("imports the asset manifest virtual module and threads it into buildApp", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain(
      'import assetManifest from "virtual:plumix/asset-manifest";',
    );
    expect(source).toContain("buildApp(config, {");
  });

  test("re-exports the worker-exports virtual module so config can surface named exports (e.g. Durable Objects)", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain('export * from "virtual:plumix/worker-exports";');
  });

  test("no-ops cleanly when the runtime omits buildScheduledHandler", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    // The generated code guards the call so a runtime that returns
    // undefined here doesn't blow up the scheduled invocation.
    expect(source).toContain("if (scheduledHandler) await scheduledHandler");
  });
});
