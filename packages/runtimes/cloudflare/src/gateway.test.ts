import type { DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { bindWorkersCache, cloudflare } from "./cdn.js";
import { serveThroughGateway } from "./gateway.js";

/** Core's universal marker and the gateway's own header, by their wire names. */
const MARKER = "x-plumix-universal-copy";
const GATEWAY_HEADER = "x-plumix-gateway";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

/** A member who saved German reads the site in it; a request alone is English. */
const savedLocale = {
  defaultLocale: "en",
  locales: ["en", "de"],
  resolveLocale: (_request: Request, user: { meta: object } | null) =>
    user !== null && "locale" in user.meta && user.meta.locale === "de"
      ? {
          code: "de",
          label: "German",
          direction: "ltr" as const,
          enabled: true,
        }
      : null,
};

/**
 * Workers Caching in front of the cached entrypoint: keyed on the URL, it
 * stores a `public` response that sets no cookie.
 */
function workersCaching(entrypoint: (request: Request) => Promise<Response>) {
  const stored = new Map<string, { body: string; headers: Headers }>();
  const caching = {
    stored,
    renders: 0,
    fetch: async (request: Request): Promise<Response> => {
      const hit = stored.get(request.url);
      if (hit !== undefined) {
        return new Response(hit.body, { headers: hit.headers });
      }
      caching.renders += 1;
      const response = await entrypoint(request);
      const shared =
        response.headers.get("cache-control")?.startsWith("public") === true &&
        !response.headers.has("set-cookie");
      if (!shared) return response;
      const body = await response.text();
      stored.set(request.url, { body, headers: response.headers });
      return new Response(body, { headers: response.headers });
    },
  };
  return caching;
}

let h: DispatcherHarness;
let caching: ReturnType<typeof workersCaching>;

beforeEach(async () => {
  caching = workersCaching((request) => h.dispatch(request));
  bindWorkersCache({
    fetch: caching.fetch,
    purge: () => Promise.resolve({ success: true, errors: [] }),
  });
  const cdn = cloudflare({
    ttl: 60,
    zoneId: "zone",
    purgeToken: "token",
  }).connect({});
  if (cdn === null) throw new Error("expected a connected cdn");
  h = await createDispatcherHarness({
    cdn,
    config: { plugins: [blog], i18n: savedLocale },
  });
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
});

afterEach(() => {
  bindWorkersCache(null);
});

function visit(
  request: Request,
  sharedCache: ((request: Request) => Promise<Response>) | null = (forwarded) =>
    caching.fetch(forwarded),
): Promise<Response> {
  return serveThroughGateway(request, {
    app: h.app,
    sharedCache,
    serve: (visitor) => h.dispatch(visitor),
  });
}

async function signedIn(
  url: string,
  user: Awaited<ReturnType<DispatcherHarness["seedUser"]>>,
): Promise<Request> {
  return h.authenticateRequest(new Request(url), user.id);
}

describe("an anonymous visitor through the gateway", () => {
  test("is served the cached copy without the universal marker", async () => {
    await visit(new Request("https://site.example/post/hello"));

    const hit = await visit(new Request("https://site.example/post/hello"));

    expect(hit.status).toBe(200);
    expect(caching.renders).toBe(1);
    expect(hit.headers.has(MARKER)).toBe(false);
    expect(hit.headers.has(GATEWAY_HEADER)).toBe(false);
  });
});

describe("a signed-in member through the gateway", () => {
  test("is served the universal copy an anonymous visit stored, under the same key", async () => {
    const anonymous = await visit(
      new Request("https://site.example/post/hello"),
    );
    const member = await h.seedUser("member");

    const page = await visit(
      await signedIn("https://site.example/post/hello?utm_source=x", member),
    );

    expect(caching.renders).toBe(1);
    expect(await page.text()).toBe(await anonymous.text());
    expect(page.headers.get("cache-control")).toBe("private, no-cache");
    expect(page.headers.get("vary")).toBe("cookie");
    expect(page.headers.has("cache-tag")).toBe(false);
    expect(page.headers.has(MARKER)).toBe(false);
    expect(page.headers.has(GATEWAY_HEADER)).toBe(false);
  });

  test("on a miss is served the universal copy the cached entrypoint renders anonymously", async () => {
    const member = await h.seedUser("member");

    const page = await visit(
      await signedIn("https://site.example/post/hello", member),
    );

    expect(page.headers.get("cache-control")).toBe("private, no-cache");
    expect(page.headers.has(MARKER)).toBe(false);
    expect([...caching.stored.keys()]).toEqual([
      "https://site.example/post/hello",
    ]);
  });

  test("renders live over a cached copy that is not universal", async () => {
    caching.stored.set("https://site.example/post/hello", {
      body: "TEASER",
      headers: new Headers({ "cache-control": "public, s-maxage=60" }),
    });
    const member = await h.seedUser("member");

    const page = await visit(
      await signedIn("https://site.example/post/hello", member),
    );

    expect(await page.text()).not.toBe("TEASER");
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(page.headers.has(MARKER)).toBe(false);
  });

  test("whose locale is their own renders live, and the render is never stored", async () => {
    const member = await h.factory.user.create({
      role: "member",
      meta: { locale: "de" },
    });

    const page = await visit(
      await signedIn("https://site.example/post/hello", member),
    );

    expect(await page.text()).toContain('<html lang="de"');
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(caching.stored.size).toBe(0);
  });
});

describe("staff through the gateway", () => {
  test("render live with the admin bar, and the render is never stored", async () => {
    const admin = await h.seedUser("admin");

    const page = await visit(
      await signedIn("https://site.example/post/hello", admin),
    );

    expect(await page.text()).toContain('data-testid="plumix-admin-bar"');
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(caching.stored.size).toBe(0);
  });
});

describe("a client sending the gateway's internal header", () => {
  test("never keeps the universal marker on a page the app serves live", async () => {
    const page = await visit(
      new Request("https://site.example/post/hello", {
        headers: { [GATEWAY_HEADER]: "1" },
      }),
      null,
    );

    expect(page.status).toBe(200);
    expect(page.headers.has(MARKER)).toBe(false);
  });
});
