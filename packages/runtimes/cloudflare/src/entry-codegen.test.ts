import { describe, expect, test } from "vitest";

import { cloudflare } from "./adapter.js";

function entry(configModule: string): string {
  return cloudflare().generateEntry({ configModule });
}

describe("cloudflare generateEntry", () => {
  test("imports the user config from the configured module specifier", () => {
    expect(entry("../plumix.config.ts")).toContain(
      'import config from "../plumix.config.ts";',
    );
  });

  test("escapes weird specifiers via JSON.stringify", () => {
    expect(entry("./path with spaces/config.ts")).toContain(
      'import config from "./path with spaces/config.ts";',
    );
  });

  test("leaves the dev-CSRF opt-in to buildApp (entry passes no dev flag)", () => {
    const source = entry("../plumix.config");
    expect(source).toContain("buildApp(config, {");
    // buildApp derives the opt-in from process.env.PLUMIX_DEV; the entry must
    // not pass it, and must not reference the old vite dev flag at all.
    expect(source).not.toContain("devCsrfLocalhost");
    expect(source).not.toContain("import.meta.env");
  });

  test("exports a fetch handler default export", () => {
    const source = entry("./config.ts");
    expect(source).toContain("export default");
    expect(source).toContain("async fetch(request, env, ctx)");
  });

  test("builds one handler through the runtime adapter and reuses it across invocations", () => {
    expect(entry("./config.ts")).toContain(
      "handler ??= config.runtime.createHandler(app)",
    );
  });

  test("forwards the positional Worker arguments into an invocation", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      "{ env, waitUntil: (promise) => ctx.waitUntil(promise) }",
    );
    expect(source).toContain("handler.fetch(request, invocation(env, ctx))");
  });

  test("hands the scheduled run report to the invocation-status rule, and branches on nothing itself", () => {
    const source = entry("./config.ts");
    expect(source).toContain("async scheduled(event, env, ctx)");
    expect(source).toContain(
      'import { surfaceScheduledFailure } from "@plumix/runtime-cloudflare";',
    );
    const start = source.indexOf("async scheduled(event, env, ctx)");
    // Bounded to the handler, because the `fetch` above it does carry a branch
    // and a throw; the positive assertions double as the guard against bounds
    // that slipped to empty, which the negative ones would pass in silence.
    const scheduled = source.slice(start, source.indexOf("\n  },", start));
    expect(scheduled).toContain(
      "const report = await handler.scheduled?.(event, invocation(env, ctx));",
    );
    expect(scheduled).toContain("surfaceScheduledFailure(report, event);");
    expect(scheduled).not.toContain("if (");
    expect(scheduled).not.toContain("throw ");
  });

  test("imports the asset manifest virtual module and threads it into buildApp", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      'import assetManifest from "virtual:plumix/asset-manifest";',
    );
    expect(source).toContain("buildApp(config, {");
  });

  test("re-exports the worker-exports virtual module so config can surface named exports (e.g. Durable Objects)", () => {
    expect(entry("./config.ts")).toContain(
      'export * from "virtual:plumix/worker-exports";',
    );
  });

  test("no-ops cleanly when the runtime handler omits scheduled", () => {
    expect(entry("./config.ts")).toContain("handler.scheduled?.(");
  });

  test("guards app construction so a dev boot failure serves the dev error page", () => {
    const source = entry("./config.ts");
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
      'import { buildApp, renderDevBootErrorResponse } from "plumix/runtime";',
    );
  });

  test("rethrows a boot failure in production so the boot path is unchanged", () => {
    // With the dev gate statically false in `plumix build`, the catch collapses
    // to a bare rethrow — identical to having no guard at all.
    expect(entry("./config.ts")).toContain("throw bootError;");
  });
});
