import ts from "typescript";
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

  test("leaves the dev gate to buildApp (entry passes no dev flag)", () => {
    const source = entry("../plumix.config");
    expect(source).toContain("buildApp(config, {");
    // buildApp derives the gate from process.env.PLUMIX_DEV; the entry must
    // not reference the old vite dev flag at all.
    expect(source).not.toContain("import.meta.env");
  });

  test("exports a fetch handler default export", () => {
    const source = entry("./config.ts");
    expect(source).toContain("export default");
    expect(source).toContain("async fetch(request, env, ctx)");
  });

  test("builds one handler through core from the runtime's spec and reuses it across invocations", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      'import { buildApp, createRuntimeHandler, renderDevBootErrorResponse } from "plumix/runtime";',
    );
    expect(source).toContain("handler ??= createRuntimeHandler(app)");
    expect(source).not.toContain("config.runtime.createHandler");
  });

  test("emits a module that parses", () => {
    const { diagnostics } = ts.transpileModule(entry("./config.ts"), {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext },
    });

    expect(diagnostics?.map((d) => d.messageText)).toEqual([]);
  });

  test("serves every request, live or cached, through the one handler it builds on first use", () => {
    expect(entry("./config.ts")).toContain(
      [
        "function serve(app, request, env, ctx) {",
        "  handler ??= createRuntimeHandler(app);",
        "  return handler.fetch(request, invocation(env, ctx));",
        "}",
      ].join("\n"),
    );
  });

  test("forwards the positional Worker arguments into an invocation", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      "{ env, waitUntil: (promise) => ctx.waitUntil(promise) }",
    );
    expect(source).toContain("handler.fetch(request, invocation(env, ctx))");
    expect(source).toContain(
      "serve: (visitor) => serve(app, visitor, env, ctx),",
    );
  });

  test("hands the scheduled run report to the invocation-status rule, and branches on nothing itself", () => {
    const source = entry("./config.ts");
    expect(source).toContain("async scheduled(event, env, ctx)");
    expect(source).toContain(
      'import { serveThroughGateway, surfaceScheduledFailure } from "@plumix/runtime-cloudflare";',
    );
    const start = source.indexOf("async scheduled(event, env, ctx)");
    // Bounded to the handler because the `fetch` above carries a branch and a
    // throw; the positive assertions guard against bounds that slipped to empty.
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

  test("imports the plugin catalogs virtual module and threads it into buildApp", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      'import pluginCatalogs from "virtual:plumix/plugin-catalogs";',
    );
    expect(source).toContain("  pluginCatalogs,\n");
  });

  test("imports the core catalog locales virtual module and threads it into buildApp", () => {
    const source = entry("./config.ts");
    expect(source).toContain(
      'import catalogLocales from "virtual:plumix/catalog-locales";',
    );
    expect(source).toContain("  catalogLocales,\n});");
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
      'import { buildApp, createRuntimeHandler, renderDevBootErrorResponse } from "plumix/runtime";',
    );
  });

  test("rethrows a boot failure in production so the boot path is unchanged", () => {
    // With the dev gate statically false in `plumix build`, the catch collapses
    // to a bare rethrow — identical to having no guard at all.
    expect(entry("./config.ts")).toContain("throw bootError;");
  });

  // The module binds Workers Caching's purge when the site enables it, so it
  // has to evaluate before the app connects its cdn.
  test("imports the Workers Caching module ahead of building the app", () => {
    const source = entry("./config.ts");
    const imported = source.indexOf(
      'import { sharedEntrypointCached } from "virtual:plumix-cloudflare/workers-caching";',
    );
    expect(imported).toBeGreaterThan(-1);
    expect(imported).toBeLessThan(source.indexOf("buildApp(config, {"));
  });

  describe("the Workers Caching gateway", () => {
    // The default export's `fetch`, up to the `scheduled` that follows it.
    function gateway(source: string): string {
      const start = source.indexOf("export default {");
      return source.slice(start, source.indexOf("async scheduled(", start));
    }

    test("defines the cached entrypoint, which serves the app", () => {
      const source = entry("./config.ts");

      expect(source).toContain(
        'import { WorkerEntrypoint } from "cloudflare:workers";',
      );
      expect(source).toContain(
        "export class PlumixSharedCache extends WorkerEntrypoint {",
      );
      expect(source).toContain(
        "return serve(await appPromise, request, this.env, this.ctx);",
      );
    });

    // Workers Caching purges only what the calling entrypoint stored.
    test("purges from inside the cached entrypoint", () => {
      expect(entry("./config.ts")).toContain(
        "  purge(options) {\n    return this.ctx.cache.purge(options);\n  }",
      );
    });

    test("hands every request to the gateway, with the cached entrypoint reached through ctx.exports", () => {
      const fetch = gateway(entry("./config.ts"));

      expect(fetch).toContain(
        [
          "    return serveThroughGateway(request, {",
          "      app,",
          "      sharedCache: sharedEntrypointCached ? (forwarded) => ctx.exports.PlumixSharedCache.fetch(forwarded) : null,",
          "      serve: (visitor) => serve(app, visitor, env, ctx),",
          "    });",
        ].join("\n"),
      );
    });
  });
});
