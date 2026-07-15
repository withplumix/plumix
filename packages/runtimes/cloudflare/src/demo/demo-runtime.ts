import type { RuntimeAdapter } from "plumix";

import { isBlockedInDemo } from "./gate.js";
import { renderDemoLoadingPage } from "./loading.js";
import {
  clearDemoCookies,
  DEMO_TTL_SECONDS,
  demoExpiresCookie,
  demoSessionCookie,
  demoStub,
  readDemoToken,
} from "./session.js";
import { injectDemoToolbar } from "./toolbar.js";

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
          const headers = new Headers({
            "content-type": "text/html; charset=utf-8",
          });
          headers.append("set-cookie", demoSessionCookie(token, request));
          headers.append("set-cookie", demoExpiresCookie(request));
          return new Response(renderDemoLoadingPage(), {
            status: 200,
            headers,
          });
        }

        if (pathname === "/_demo/reset") {
          const headers = new Headers({
            location: new URL("/demo", request.url).toString(),
          });
          for (const cookie of clearDemoCookies()) {
            headers.append("set-cookie", cookie);
          }
          return new Response(null, { status: 302, headers });
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

        if (isBlockedInDemo(pathname)) {
          return Response.json(
            { error: "Not available in the demo" },
            { status: 403 },
          );
        }

        if (!readDemoToken(request)) {
          return Response.redirect(
            new URL("/demo", request.url).toString(),
            302,
          );
        }

        const response = await handle(request, env, ctx);
        // The toolbar is a public-site affordance. Keep it off `/_plumix/*`
        // (the admin SPA and its preview iframe), where a fixed pill would
        // overlap the editor's own chrome and appear twice.
        return pathname.startsWith("/_plumix/")
          ? response
          : injectToolbar(response);
      };
    },
    // buildScheduledHandler is intentionally omitted: demo mode has no shared
    // database, so scheduled tasks (session cleanup, publish-scheduled) have
    // nothing to act on. Omitting it makes the worker's scheduled() a no-op.
  };
}

/** Inject the demo toolbar into HTML responses; pass everything else through. */
async function injectToolbar(response: Response): Promise<Response> {
  // Skip null-body statuses (204/304/…) — `new Response(body, { status })`
  // throws for those — and any non-HTML payload.
  if (
    response.body === null ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    return response;
  }
  const html = injectDemoToolbar(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
}
