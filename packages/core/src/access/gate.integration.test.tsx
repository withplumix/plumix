import { describe, expect, test, vi } from "vitest";

import type { CustomArchiveData } from "../route/render/resolved-entry.js";
import type { ConnectedCache } from "../runtime/slots.js";
import { SEGMENT_KEY_PARAM } from "../cache/decision.js";
import { definePlugin } from "../plugin/define.js";
import { fallback, forArchiveType } from "../route/render/template-builders.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { ACCESS_POLICY_META_KEY } from "./meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  entitlement,
  entitlementSegment,
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

async function authed(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  path: string,
  userId: number,
) {
  return h.authenticateRequest(
    new Request(`https://cms.example${path}`),
    userId,
  );
}

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

  // A per-request grant (a draft preview, an editor session) must never be
  // stored under the shared segment entry, where it would outlive the grant and
  // serve a draft/editor render to other members. The gate still allows
  // (`authenticated`), but the render is forced private.
  test.each(["preview=tok", "plumix.edit"])(
    "an ephemeral ?%s grant on a policied route bypasses the shared cache",
    async (query) => {
      const { cache, match, put } = memoryCache();
      const h = await createDispatcherHarness({
        plugins: [membersPlugin],
        cache,
      });
      await seedEntry(h, "article", "gated");
      const editor = await h.seedUser("editor");

      const response = await h.dispatch(
        await authed(h, `/article/gated?${query}`, editor.id),
      );
      await h.drainDeferred();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(match).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    },
  );
});

// The paywall: a soft gate. An active `entitlement:premium` gets the full
// render under one shared segment; everyone else (anonymous or lapsed) gets a
// teaser at their own segment — the same URL, a distinct cache variant. A
// mutable `entitled` set stands in for the developer's per-request entitlement
// check (a `meta` flag, their own table, an external billing API), letting a
// test flip a subscription active/lapsed between requests.
interface PaywallData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "premium";
  readonly summary: string;
  readonly body: string;
}
declare module "../template-registry.js" {
  interface ArchiveTypeRegistry {
    premium: { data: PaywallData };
  }
}

function paywallSetup() {
  const entitled = new Set<number>();
  const plugin = definePlugin("paywall", (ctx) => {
    ctx.registerArchiveType("premium", {
      routes: ["/premium"],
      access: definePolicy({
        segments: [entitlementSegment("premium")],
        // Runs on every request, before the cache lookup — its result is never
        // cached, so a lapsed entitlement is denied on the next request.
        resolve: (c) =>
          c.user && entitled.has(c.user.id)
            ? entitlement("premium")
            : challenge("subscribe", { soft: true }),
      }),
      // A custom archive opts into caching so the teaser/full variants persist.
      cacheable: true,
      resolve: () => ({
        data: {
          kind: "custom",
          name: "premium",
          summary: "PUBLIC-SUMMARY",
          body: "FULL-ARTICLE-BODY",
        },
        title: "Premium",
      }),
    });
  });
  const theme = defineTheme({
    templates: [
      forArchiveType("premium").template(
        defineTemplate<PaywallData>({
          render: ({ data, ctx }) => {
            // The soft-gate seam: a `challenge` gate means render the teaser.
            // The teaser variant is a public document, so it withholds the
            // protected body server-side and shows only the free summary; the
            // full body renders solely on the entitled `allow` branch.
            const gated = ctx.access?.gate.type === "challenge";
            return gated ? (
              <main data-testid="teaser">{data.summary}</main>
            ) : (
              <main data-testid="full">{data.body}</main>
            );
          },
        }),
      ),
      fallback(() => null),
    ],
  });
  return { entitled, plugin, theme };
}

describe("access gate — soft gate / paywall (#1741)", () => {
  test("an active entitlement gets the full render under a shared segment", async () => {
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({ plugins: [plugin], theme });
    const member = await h.seedUser("subscriber");
    entitled.add(member.id);

    const response = await h.dispatch(await authed(h, "/premium", member.id));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-testid="full"');
    expect(html).toContain("FULL-ARTICLE-BODY");
    // No soft challenge on the full render — no teaser signal.
    expect(response.headers.get("x-plumix-challenge")).toBe(null);
  });

  test("two entitled principals share one full-variant cache entry", async () => {
    const { cache, store } = memoryCache();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      plugins: [plugin],
      theme,
      cache,
    });
    const alice = await h.seedUser("subscriber");
    const bob = await h.seedUser("subscriber");
    entitled.add(alice.id);
    entitled.add(bob.id);

    const first = await h.dispatch(await authed(h, "/premium", alice.id));
    await h.drainDeferred();
    expect(first.status).toBe(200);

    // One entry, keyed by the `entitlement:premium` segment — not per identity.
    expect(store.size).toBe(1);
    const key = [...store.keys()][0];
    if (key === undefined) throw new Error("expected a stored cache entry");
    expect(new URL(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "entitlement:premium",
    );

    store.set(key, {
      response: new Response("SHARED-FULL", { status: 200 }),
      tags: [],
    });
    const second = await h.dispatch(await authed(h, "/premium", bob.id));
    expect(await second.text()).toBe("SHARED-FULL");
    expect(store.size).toBe(1);
  });

  test("serves teaser and full as two cache variants at one URL", async () => {
    const { cache, store } = memoryCache();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      plugins: [plugin],
      theme,
      cache,
    });
    const member = await h.seedUser("subscriber");
    entitled.add(member.id);

    // Anonymous visitor (a search-engine crawler) → the teaser variant: a 200,
    // publicly cacheable page carrying only the free summary. The protected body
    // is withheld server-side, so it can't leak through the public entry.
    const teaser = await h.dispatch(new Request("https://cms.example/premium"));
    await h.drainDeferred();
    expect(teaser.status).toBe(200);
    const teaserHtml = await teaser.text();
    expect(teaserHtml).toContain('data-testid="teaser"');
    expect(teaserHtml).toContain("PUBLIC-SUMMARY");
    expect(teaserHtml).not.toContain("FULL-ARTICLE-BODY");
    expect(teaser.headers.get("x-plumix-challenge")).toBe("subscribe");

    // Entitled member → the full variant, at the same URL: the full text is
    // present here, the appropriate variant for it.
    const full = await h.dispatch(await authed(h, "/premium", member.id));
    await h.drainDeferred();
    expect(full.status).toBe(200);
    const fullHtml = await full.text();
    expect(fullHtml).toContain('data-testid="full"');
    expect(fullHtml).toContain("FULL-ARTICLE-BODY");

    // Two variants stored for the one path: anonymous teaser + entitled full.
    expect(store.size).toBe(2);
    const segments = [...store.keys()].map((k) =>
      new URL(k).searchParams.get(SEGMENT_KEY_PARAM),
    );
    // The anonymous teaser is keyed at the plain URL (no segment marker) so it
    // is the shared, crawler-visible document; the full render is segmented.
    expect(segments).toContain(null);
    expect(segments).toContain("entitlement:premium");
    const paths = new Set([...store.keys()].map((k) => new URL(k).pathname));
    expect(paths).toEqual(new Set(["/premium"]));
  });

  test("a lapsed entitlement is denied on the next request without cache busting", async () => {
    const { cache, store } = memoryCache();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      plugins: [plugin],
      theme,
      cache,
    });
    const member = await h.seedUser("subscriber");
    entitled.add(member.id);

    // While entitled: the full variant renders and is cached.
    const active = await h.dispatch(await authed(h, "/premium", member.id));
    await h.drainDeferred();
    expect(await active.text()).toContain('data-testid="full"');
    expect(store.size).toBe(1);

    // The subscription lapses (the external check now returns false). No cache
    // busting — the full variant stays put.
    entitled.delete(member.id);

    const lapsed = await h.dispatch(await authed(h, "/premium", member.id));
    await h.drainDeferred();
    // Denied the full render on the very next request: they resolve to the
    // teaser segment now, never reading the still-cached full variant.
    const lapsedHtml = await lapsed.text();
    expect(lapsedHtml).toContain('data-testid="teaser"');
    expect(lapsed.headers.get("x-plumix-challenge")).toBe("subscribe");
    // The entitled variant was neither purged nor overwritten.
    const keys = [...store.keys()].map((k) =>
      new URL(k).searchParams.get(SEGMENT_KEY_PARAM),
    );
    expect(keys).toContain("entitlement:premium");
  });
});

// An entry type whose single routes are PUBLIC by default but declare a
// selectable `members` policy an editor can assign per-entry. Proves the
// per-entry choice (stored under the reserved access meta key) overrides the
// type default at the gate and in the cache key — the load-bearing data seam of
// #1742. Precedence: per-entry › entry-type › global.
const perEntryPlugin = definePlugin("per-entry", (ctx) => {
  ctx.registerEntryType("column", {
    label: "Columns",
    isPublic: true,
    access: {
      default: anonymousPolicy,
      policies: [
        { key: "members", label: "Members only", policy: authenticatedPolicy },
      ],
    },
  });
});

async function seedColumn(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  slug: string,
  meta: Record<string, unknown>,
) {
  const author = await h.seedUser("admin");
  return h.factory.entry.create({
    type: "column",
    slug,
    title: `${slug} title`,
    content: null,
    status: "published",
    authorId: author.id,
    parentId: null,
    meta,
  });
}

describe("access gate — per-entry visibility (#1742)", () => {
  test("a per-entry choice gates an otherwise-public entry for anonymous visitors", async () => {
    const h = await createDispatcherHarness({ plugins: [perEntryPlugin] });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });

    const response = await h.dispatch(
      new Request("https://cms.example/column/locked"),
    );
    // The type default is `anonymous` (public), but this one entry selected
    // `members` — the gate honours the per-entry override and redirects.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Fcolumn%2Flocked",
    );
  });

  test("renders the per-entry-gated entry for an authenticated visitor", async () => {
    const h = await createDispatcherHarness({ plugins: [perEntryPlugin] });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    const subscriber = await h.seedUser("subscriber");

    const response = await h.dispatch(
      new Request("https://cms.example/column/locked"),
      subscriber,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("locked title");
  });

  test("a sibling entry with no choice stays public (precedence falls to the type default)", async () => {
    const h = await createDispatcherHarness({ plugins: [perEntryPlugin] });
    await seedColumn(h, "open", {});

    const response = await h.dispatch(
      new Request("https://cms.example/column/open"),
    );
    // No per-entry choice → the `anonymous` type default → served publicly.
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("open title");
  });

  test("an unknown stored choice falls back to the type default, never granting less", async () => {
    const h = await createDispatcherHarness({ plugins: [perEntryPlugin] });
    // A key the developer removed from the space: the gate falls back to the
    // type default (`anonymous`) rather than failing open to something laxer.
    await seedColumn(h, "stale", { [ACCESS_POLICY_META_KEY]: "ghost" });

    const response = await h.dispatch(
      new Request("https://cms.example/column/stale"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("stale title");
  });

  test("the cache segment reflects the per-entry choice", async () => {
    const { cache, store } = memoryCache();
    const h = await createDispatcherHarness({
      plugins: [perEntryPlugin],
      cache,
    });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    const sub = await h.seedUser("subscriber");

    await h.dispatch(await authed(h, "/column/locked", sub.id));
    await h.drainDeferred();

    // The gated entry caches under the `authenticated` segment its per-entry
    // policy resolved to — not the plain anonymous URL.
    expect(store.size).toBe(1);
    const key = [...store.keys()][0];
    if (key === undefined) throw new Error("expected a stored cache entry");
    expect(new URL(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );
  });
});
