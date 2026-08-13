import { describe, expect, test, vi } from "vitest";

import type { CustomArchiveData } from "../route/render/resolved-entry.js";
import type { ConnectedCache } from "../runtime/slots.js";
import { SEGMENT_KEY_PARAM } from "../cache/decision.js";
import { definePlugin } from "../plugin/define.js";
import { fallback, forArchiveType } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import {
  authenticatedPolicy,
  definePolicy,
  grant,
  redirectToLogin,
  rolePolicy,
} from "./policy.js";

// Two custom archives standing in for policied public routes: one
// authenticated-only, one gated to `editor`. The route-level `access` policy is
// the seam under test end-to-end.
interface GatedData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "members" | "staff";
  readonly label: string;
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    members: { data: GatedData };
    staff: { data: GatedData };
  }
}

const gatedPlugin = definePlugin("gated", (ctx) => {
  ctx.registerArchiveType("members", {
    routes: ["/members"],
    access: authenticatedPolicy,
    resolve: () => ({
      data: { kind: "custom", name: "members", label: "members-area" },
      title: "Members",
    }),
  });
  ctx.registerArchiveType("staff", {
    routes: ["/staff"],
    access: rolePolicy("editor"),
    resolve: () => ({
      data: { kind: "custom", name: "staff", label: "staff-area" },
      title: "Staff",
    }),
  });
});

const gatedTheme = defineTheme({
  templates: [
    forArchiveType("members").template(({ data }) => (
      <main>
        <h1 data-testid="members">{data.label}</h1>
      </main>
    )),
    forArchiveType("staff").template(({ data }) => (
      <main>
        <h1 data-testid="staff">{data.label}</h1>
      </main>
    )),
    fallback(() => null),
  ],
});

describe("access gate — hard gate through the dispatcher", () => {
  test("redirects an anonymous visitor to sign-in with a returnTo", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const response = await h.dispatch(
      new Request("https://cms.example/members?ref=nav"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Fmembers%3Fref%3Dnav",
    );
  });

  test("renders the protected route for an authenticated visitor", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/members"),
      subscriber,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="members"');
  });

  test("denies an under-privileged visitor at a role gate with a 403", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/staff"),
      subscriber,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
  });

  test("admits a sufficiently-privileged visitor at a role gate", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    const editor = await h.seedUser("editor");
    const response = await h.dispatch(
      new Request("https://cms.example/staff"),
      editor,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="staff"');
  });

  test("leaves an un-policied route untouched", async () => {
    const h = await createDispatcherHarness({
      plugins: [gatedPlugin],
      theme: gatedTheme,
    });
    // The front page carries no policy — anonymous, no redirect.
    const response = await h.dispatch(new Request("https://cms.example/"));
    expect(response.status).not.toBe(302);
  });
});

// An entry type carrying an `access.default` gates its single (and archive)
// routes end-to-end — proving the policy survives registration and the
// single/archive intent branch of `policyForMatch` fires through the real
// dispatcher, not just a stubbed registry.
const articlesPlugin = definePlugin("articles", (ctx) => {
  ctx.registerEntryType("article", {
    label: "Articles",
    isPublic: true,
    access: { default: authenticatedPolicy },
  });
});

describe("access gate — entry-type-level policy", () => {
  async function seedArticle(
    h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  ) {
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "article",
      slug: "gated",
      title: "Gated Article",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
  }

  test("redirects an anonymous visitor away from a gated entry's single route", async () => {
    const h = await createDispatcherHarness({ plugins: [articlesPlugin] });
    await seedArticle(h);
    const response = await h.dispatch(
      new Request("https://cms.example/article/gated"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Farticle%2Fgated",
    );
  });

  test("renders the gated entry for an authenticated visitor", async () => {
    const h = await createDispatcherHarness({ plugins: [articlesPlugin] });
    await seedArticle(h);
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      new Request("https://cms.example/article/gated"),
      subscriber,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gated Article");
    // With no cache binding, the copy sent to the client is always live and
    // per-visitor: an `authenticated` render carries `private, no-store` so a
    // downstream intermediary never shares it under the plain URL.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

// A real in-memory edge cache: `match`/`put` key on the request URL, exactly as
// the Workers Cache API does, so the segment folded into the key by #1740 is
// what separates (or collapses) entries.
function memoryCache() {
  const store = new Map<
    string,
    { readonly response: Response; readonly tags: readonly string[] }
  >();
  const match = vi.fn((req: Request) =>
    Promise.resolve(store.get(req.url)?.response.clone()),
  );
  const put = vi.fn(
    (req: Request, response: Response, tags: readonly string[]) => {
      store.set(req.url, { response, tags });
      return Promise.resolve();
    },
  );
  const cache: ConnectedCache = {
    match,
    put,
    purgeTags: vi.fn(() => Promise.resolve()),
  };
  return { cache, store, match, put };
}

// An entry type whose single/archive routes require login and cache under the
// shared `authenticated` segment (the "explicit opt-in" of #1740) …
const membersPlugin = definePlugin("member-articles", (ctx) => {
  ctx.registerEntryType("article", {
    label: "Articles",
    isPublic: true,
    access: { default: authenticatedPolicy },
  });
});

// … versus one whose policy grants the reserved `private` segment: gated, yet
// never shared-cached.
const privatePlugin = definePlugin("private-memos", (ctx) => {
  ctx.registerEntryType("memo", {
    label: "Memos",
    isPublic: true,
    access: {
      default: definePolicy({
        resolve: (c) => (c.user ? grant("private") : redirectToLogin()),
      }),
    },
  });
});

async function seedEntry(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  type: string,
  slug: string,
) {
  const author = await h.seedUser("admin");
  return h.factory.entry.create({
    type,
    slug,
    title: `${slug} title`,
    content: null,
    status: "published",
    authorId: author.id,
    parentId: null,
  });
}

const authed = async (
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  path: string,
  userId: number,
) => h.authenticateRequest(new Request(`https://cms.example${path}`), userId);

describe("access gate — segment-keyed caching (#1740)", () => {
  test("two subscribers in one segment share a single cache entry keyed by segment", async () => {
    const { cache, store } = memoryCache();
    const h = await createDispatcherHarness({
      plugins: [membersPlugin],
      cache,
    });
    await seedEntry(h, "article", "gated");
    const alice = await h.seedUser("subscriber");
    const bob = await h.seedUser("subscriber");

    const first = await h.dispatch(await authed(h, "/article/gated", alice.id));
    await h.drainDeferred();
    expect(first.status).toBe(200);

    // One entry, stored under the `authenticated` segment — not the plain URL.
    expect(store.size).toBe(1);
    const key = [...store.keys()][0];
    if (key === undefined) throw new Error("expected a stored cache entry");
    expect(new URL(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );

    // Swap the stored body for a sentinel; a second subscriber (a different
    // session cookie) must read that same entry rather than re-render.
    store.set(key, {
      response: new Response("SHARED-VARIANT", { status: 200 }),
      tags: [],
    });
    const second = await h.dispatch(await authed(h, "/article/gated", bob.id));
    expect(await second.text()).toBe("SHARED-VARIANT");
    expect(store.size).toBe(1);
  });

  test("the segment variant carries the same t:/e: tags as the anonymous document", async () => {
    const { cache, store } = memoryCache();
    const h = await createDispatcherHarness({
      plugins: [membersPlugin],
      cache,
    });
    const entry = await seedEntry(h, "article", "tagged");
    const sub = await h.seedUser("subscriber");

    await h.dispatch(await authed(h, "/article/tagged", sub.id));
    await h.drainDeferred();

    const [stored] = [...store.values()];
    // Unchanged vocabulary: one publish of the article purges every segment
    // variant because they all share this tag set (#1740 AC3).
    expect(stored?.tags).toContain("t:article");
    expect(stored?.tags).toContain(`e:${String(entry.id)}`);
  });

  test("a private-granting policy is never read from or written to the cache", async () => {
    const { cache, store, match, put } = memoryCache();
    const h = await createDispatcherHarness({
      plugins: [privatePlugin],
      cache,
    });
    await seedEntry(h, "memo", "secret");
    const sub = await h.seedUser("subscriber");

    const response = await h.dispatch(await authed(h, "/memo/secret", sub.id));
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  test("an un-policied page keeps today's authenticated ⇒ private bypass", async () => {
    const { cache, match, put } = memoryCache();
    const h = await createDispatcherHarness({
      plugins: [membersPlugin],
      cache,
    });
    const sub = await h.seedUser("subscriber");

    // The front page carries no policy: a signed-in visitor bypasses the shared
    // cache entirely, exactly as before this slice (no opt-in ⇒ private).
    const response = await h.dispatch(await authed(h, "/", sub.id));
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
