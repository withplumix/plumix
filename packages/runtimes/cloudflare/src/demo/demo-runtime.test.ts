import type { PlumixHandler } from "plumix";
import type { DatabaseAdapter } from "plumix/runtime";
import { plumix, resolveEnvInput } from "plumix";
import { auth } from "plumix/auth";
import { buildApp, createRuntimeHandler } from "plumix/runtime";
import { defineTheme } from "plumix/theme";
import { describe, expect, test } from "vitest";

import { cloudflare } from "../adapter.js";
import { DemoError } from "../errors.js";
import { r2 } from "../r2.js";
import { readEnvString } from "../read-env.js";
import { demoRuntime } from "./demo-runtime.js";
import { demoPreset } from "./preset.js";
import { DEMO_COOKIE_NAME } from "./session.js";

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};

const runtime = demoRuntime(cloudflare(), {
  binding: "DEMO_DO",
  loadSql: () => Promise.resolve(""),
});

function createApp(storage?: ReturnType<typeof r2>) {
  return buildApp(
    plumix({
      runtime,
      database: stubDatabase,
      auth: auth({
        passkey: {
          rpName: "Plumix Test",
          rpId: "cms.example",
          origin: "https://cms.example",
        },
      }),
      theme: defineTheme({ templates: () => null }),
      ...(storage ? { storage } : {}),
    }),
  );
}

describe("demoRuntime — the handler core builds for it", () => {
  test("refuses an app with a storage slot", async () => {
    const app = await createApp(r2({ binding: "MEDIA" }));

    let thrown: unknown;
    try {
      createRuntimeHandler(app);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DemoError);
    expect(thrown).toMatchObject({ code: "storage_not_supported" });
  });

  test("builds a handler for an app without one", async () => {
    const app = await createApp();

    expect(createRuntimeHandler(app).fetch).toBeTypeOf("function");
  });

  test("answers its own session routes in front of the site", async () => {
    const handler = createRuntimeHandler(await createApp());

    const response = await handler.fetch(
      new Request("https://cms.example/_demo/reset"),
      { env: {} },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cms.example/demo");
  });
});

describe("demoRuntime — the admin areas it refuses", () => {
  test("declares every area the demo gate refuses", () => {
    expect([...(runtime.refusedAdminAreas ?? [])].sort()).toEqual([
      "apiTokens",
      "deviceAuthorization",
      "emailDelivery",
      "oauthLinking",
      "passkeys",
    ]);
  });

  test("the base runtime it wraps refuses none", () => {
    expect(cloudflare().refusedAdminAreas).toBeUndefined();
  });
});

describe("demoRuntime — the site origin", () => {
  // An inner handler that answers with the origin the app would resolve.
  const echoOrigin: PlumixHandler = {
    fetch: (_request, invocation) =>
      new Response(readEnvString(invocation.env, "PUBLIC_ORIGIN")),
  };
  const config = plumix({
    runtime,
    database: stubDatabase,
    auth: auth({
      passkey: {
        rpName: "Plumix Test",
        rpId: "cms.example",
        origin: "https://cms.example",
      },
    }),
    theme: defineTheme({ templates: () => null }),
  });
  const wrapped = (): PlumixHandler => {
    const wrap = runtime.handler.wrap;
    if (!wrap) throw new Error("the demo runtime wraps its handler");
    return wrap(echoOrigin, config);
  };
  const withSession = (url: string): Request =>
    new Request(url, { headers: { cookie: `${DEMO_COOKIE_NAME}=t1` } });

  // The demo's absolute URLs (canonical, og:url) come from the site origin, so
  // a deploy that sets none gets the host it is served from.
  test("with no PUBLIC_ORIGIN set, the app gets the request's own origin", async () => {
    const response = await wrapped().fetch(
      withSession("https://demo.plumix.dev/posts/hello"),
      { env: {} },
    );
    expect(await response.text()).toBe("https://demo.plumix.dev");
  });

  test("a PUBLIC_ORIGIN the deploy sets wins", async () => {
    const response = await wrapped().fetch(
      withSession("https://preview.demo.plumix.dev/"),
      { env: { PUBLIC_ORIGIN: "https://demo.plumix.dev" } },
    );
    expect(await response.text()).toBe("https://demo.plumix.dev");
  });

  test("the preset's site origin reads PUBLIC_ORIGIN", () => {
    const { passkey } = demoPreset({
      binding: "DEMO_DO",
      loadSql: () => Promise.resolve(""),
    }).auth;
    expect(
      resolveEnvInput(passkey.origin, { PUBLIC_ORIGIN: "https://x.example" }),
    ).toBe("https://x.example");
  });
});

describe("demoRuntime — the toolbar names what's off", () => {
  const page: PlumixHandler = {
    fetch: () =>
      new Response("<html><body><p>post</p></body></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  };
  const config = plumix({
    runtime,
    database: stubDatabase,
    auth: auth({
      passkey: {
        rpName: "Plumix Test",
        rpId: "cms.example",
        origin: "https://cms.example",
      },
    }),
    theme: defineTheme({ templates: () => null }),
  });
  const fetchPage = async (headers: HeadersInit): Promise<string> => {
    const wrap = runtime.handler.wrap;
    if (!wrap) throw new Error("the demo runtime wraps its handler");
    const response = await wrap(page, config).fetch(
      new Request("https://demo.plumix.dev/posts/hello", { headers }),
      { env: {} },
    );
    return response.text();
  };

  test("lists every refused area to a session holder", async () => {
    const html = await fetchPage({ cookie: `${DEMO_COOKIE_NAME}=t1` });

    expect(html).toContain(
      "Off in this demo: API tokens, Device sign-in, Passkeys, OAuth sign-in, and Email delivery",
    );
  });

  // Unit tests read an empty stand-in for the compiled catalogs, so the labels
  // stay English; the list's own grammar shows the visitor's locale won.
  test("lists them in the visitor's language", async () => {
    const html = await fetchPage({
      cookie: `${DEMO_COOKIE_NAME}=t1`,
      "accept-language": "de-DE,de;q=0.9",
    });

    expect(html).toContain("OAuth sign-in und Email delivery");
  });
});
