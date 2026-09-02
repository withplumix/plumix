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

  test("builds one handler through the runtime adapter and reuses it across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("handler ??= config.runtime.createHandler(app)");
  });

  test("forwards the positional Worker arguments into an invocation", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain(
      "{ env, waitUntil: (promise) => ctx.waitUntil(promise) }",
    );
    expect(source).toContain("handler.fetch(request, invocation(env, ctx))");
  });

  test("exports a scheduled handler that calls the runtime handler's scheduled", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("async scheduled(event, env, ctx)");
    expect(source).toContain(
      "await handler.scheduled(event, invocation(env, ctx))",
    );
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

  test("no-ops cleanly when the runtime handler omits scheduled", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("if (handler.scheduled) await handler.scheduled");
  });

  test("guards app construction so a dev boot failure serves the dev error page", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    // The await is wrapped so a rejected buildApp is caught rather than crashing
    // the request opaquely.
    expect(source).toContain("try {");
    expect(source).toContain("await appPromise");
    expect(source).toContain("} catch (bootError) {");
    // Dev-only: the whole branch is gated so it (and the imported renderer)
    // tree-shakes out of production builds.
    expect(source).toContain("if (process.env.PLUMIX_DEV)");
    expect(source).toContain("renderDevBootErrorResponse(bootError)");
    expect(source).toContain(
      'import { buildApp, renderDevBootErrorResponse } from "plumix";',
    );
  });

  test("rethrows a boot failure in production so the boot path is unchanged", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    // With the dev gate statically false in `plumix build`, the catch collapses
    // to a bare rethrow — identical to having no guard at all.
    expect(source).toContain("throw bootError;");
  });
});
