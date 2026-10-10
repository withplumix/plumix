import type { PlumixEnv, RuntimeAdapter } from "plumix";
import { resolveEnvInput } from "plumix";
import { listAdminAreas } from "plumix/runtime";

import type { WorkerEnv } from "../read-env.js";
import type { TurnstileConfig } from "./turnstile.js";
import { DemoError } from "../errors.js";
import { readEnvString } from "../read-env.js";
import { DEMO_REFUSED_AREAS, isBlockedInDemo } from "./gate.js";
import { renderDemoLoadingPage } from "./loading.js";
import {
  clearDemoCookies,
  DEMO_SHOWCASE_NAME,
  DEMO_TTL_SECONDS,
  demoExpiresCookie,
  demoSessionCookie,
  demoStub,
  readDemoToken,
} from "./session.js";
import { injectDemoToolbar, shouldInjectDemoToolbar } from "./toolbar.js";
import { verifyTurnstile } from "./turnstile.js";

/** The env var the demo's site origin is read from (see demoPreset). */
export const PUBLIC_ORIGIN = "PUBLIC_ORIGIN";

const DEMO_EXPORTS_MODULE = "@plumix/runtime-cloudflare/demo/durable-object";

export interface DemoRuntimeConfig {
  /** DemoDB Durable Object namespace binding name. */
  readonly binding: string;
  /** Assembles the bootstrap SQL applied to a fresh session's DO. */
  readonly loadSql: () => Promise<string>;
  /** Optional Turnstile challenge gating `/_demo/init` (bot mitigation). */
  readonly turnstile?: TurnstileConfig;
}

/**
 * Any request without a session is routed through `/demo`, which provisions the
 * visitor's DO.
 */
export function demoRuntime(
  inner: RuntimeAdapter,
  config: DemoRuntimeConfig,
): RuntimeAdapter {
  const { binding, loadSql, turnstile } = config;
  return {
    name: `${inner.name}+demo`,
    commandsModule: inner.commandsModule,
    workerExports: [...(inner.workerExports ?? []), DEMO_EXPORTS_MODULE],
    // What the gate below refuses, so the admin hides it rather than offering
    // an action that can only 403.
    refusedAdminAreas: DEMO_REFUSED_AREAS,
    // Demo mode changes what the handler does, not the shape the platform
    // serves, so the entry is the base runtime's.
    generateEntry(options) {
      return inner.generateEntry(options);
    },
    handler: {
      ...inner.handler,
      wrap(built, appConfig) {
        // Sessions each get their own database but would all write to one
        // bucket, so one visitor's uploads and deletes would reach every other.
        if (appConfig.storage) throw DemoError.storageNotSupported();
        const handler = inner.handler.wrap?.(built, appConfig) ?? built;
        // Seed the shared showcase DO once per isolate, lazily on first
        // cookieless request that needs it.
        let showcaseReady = false;
        // `scheduled` is intentionally omitted: demo mode has no shared
        // database, so scheduled tasks (session cleanup, publish-scheduled)
        // have nothing to act on. Omitting it makes the worker's scheduled() a
        // no-op.
        return {
          fetch: async (request, invocation) => {
            const { pathname } = new URL(request.url);
            const { env } = invocation;

            if (pathname === "/demo") {
              const token = readDemoToken(request) ?? crypto.randomUUID();
              // Empty or absent site key → no widget (see
              // renderDemoLoadingPage).
              const siteKey = activeTurnstile(turnstile, env)?.siteKey;
              const headers = new Headers({
                "content-type": "text/html; charset=utf-8",
              });
              headers.append("set-cookie", demoSessionCookie(token, request));
              headers.append("set-cookie", demoExpiresCookie(request));
              return new Response(renderDemoLoadingPage(siteKey), {
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
                return Response.json(
                  { error: "no demo session" },
                  { status: 400 },
                );
              }
              const active = activeTurnstile(turnstile, env);
              if (active) {
                const challenge =
                  request.headers.get("cf-turnstile-token") ?? "";
                if (!(await verifyTurnstile(active.secretKey, challenge))) {
                  return Response.json(
                    { error: "challenge failed" },
                    { status: 403 },
                  );
                }
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

            const hasSession = readDemoToken(request) !== null;
            if (!hasSession) {
              // The admin needs a session — route newcomers through /demo.
              // Public pages (and media) render from the shared read-only
              // showcase, which we seed once per isolate.
              if (pathname.startsWith("/_plumix/admin")) {
                return Response.redirect(
                  new URL("/demo", request.url).toString(),
                  302,
                );
              }
              if (!showcaseReady) {
                await demoStub(env, binding, DEMO_SHOWCASE_NAME).initialize(
                  await loadSql(),
                );
                showcaseReady = true;
              }
            }

            // A deploy without PUBLIC_ORIGIN gets the serving host, so
            // canonical and share URLs point back at itself.
            const withOrigin: WorkerEnv = {
              ...env,
              [PUBLIC_ORIGIN]: new URL(request.url).origin,
            };
            const response = await handler.fetch(
              request,
              readEnvString(env, PUBLIC_ORIGIN)
                ? invocation
                : { ...invocation, env: withOrigin },
            );
            return shouldInjectDemoToolbar(request)
              ? injectToolbar(
                  response,
                  hasSession,
                  listAdminAreas(
                    DEMO_REFUSED_AREAS,
                    request.headers.get("accept-language"),
                  ),
                )
              : response;
          },
        };
      },
    },
  };
}

// Keyed on the secret: a secret without a site key fails loud rather than
// silently disabling the gate.
function activeTurnstile(
  turnstile: TurnstileConfig | undefined,
  env: PlumixEnv,
): { siteKey: string; secretKey: string } | undefined {
  if (!turnstile) return undefined;
  const secretKey = resolveEnvInput(turnstile.secretKey, env);
  if (!secretKey) return undefined;
  return { siteKey: resolveEnvInput(turnstile.siteKey, env), secretKey };
}

async function injectToolbar(
  response: Response,
  hasSession: boolean,
  off: string,
): Promise<Response> {
  // Skip null-body statuses (204/304/…) — `new Response(body, { status })`
  // throws for those — and any non-HTML payload.
  if (
    response.body === null ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    return response;
  }
  const html = injectDemoToolbar(await response.text(), hasSession, off);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
}
