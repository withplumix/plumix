import type { RuntimeAdapter } from "plumix";

import { renderDemoLoadingPage } from "./loading.js";
import {
  DEMO_TTL_SECONDS,
  demoSessionCookie,
  demoStub,
  readDemoToken,
} from "./session.js";

/** Subpath whose named exports (DemoDB) the generated worker re-exports. */
const DEMO_EXPORTS_MODULE = "@plumix/runtime-cloudflare/demo/durable-object";

export interface DemoRuntimeConfig {
  /** DemoDB Durable Object namespace binding name. */
  readonly binding: string;
  /** Assembles the bootstrap SQL applied to a fresh session's DO. */
  readonly loadSql: () => Promise<string>;
}

/**
 * Wraps a base runtime so the deploy behaves as an anonymous demo: `/demo`
 * mints a session and shows a loading page, `/_demo/init` migrates + seeds the
 * visitor's Durable Object and arms its TTL, and any request without a session
 * is routed through `/demo`. Everything else delegates to the base runtime,
 * which resolves the visitor's DO via the demo database adapter.
 */
export function demoRuntime(
  inner: RuntimeAdapter,
  config: DemoRuntimeConfig,
): RuntimeAdapter {
  const { binding, loadSql } = config;
  return {
    name: `${inner.name}+demo`,
    commandsModule: inner.commandsModule,
    workerExports: [...(inner.workerExports ?? []), DEMO_EXPORTS_MODULE],
    buildFetchHandler(app) {
      const handle = inner.buildFetchHandler(app);
      return async (request, env, ctx) => {
        const { pathname } = new URL(request.url);

        if (pathname === "/demo") {
          const token = readDemoToken(request) ?? crypto.randomUUID();
          return new Response(renderDemoLoadingPage(), {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "set-cookie": demoSessionCookie(token, request),
            },
          });
        }

        if (pathname === "/_demo/init" && request.method === "POST") {
          const token = readDemoToken(request);
          if (!token) {
            return Response.json({ error: "no demo session" }, { status: 400 });
          }
          const stub = demoStub(env, binding, token);
          await stub.initialize(await loadSql());
          await stub.setTtlAlarm(DEMO_TTL_SECONDS);
          return Response.json({ ok: true });
        }

        if (!readDemoToken(request)) {
          return Response.redirect(
            new URL("/demo", request.url).toString(),
            302,
          );
        }

        return handle(request, env, ctx);
      };
    },
    // buildScheduledHandler is intentionally omitted: demo mode has no shared
    // database, so scheduled tasks (session cleanup, publish-scheduled) have
    // nothing to act on. Omitting it makes the worker's scheduled() a no-op.
  };
}
