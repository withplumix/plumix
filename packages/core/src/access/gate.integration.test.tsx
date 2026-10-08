import { describe, expect, test, vi } from "vitest";

import type { BlockSpec } from "../blocks/index.js";
import type { AppContext } from "../context/app-context.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";
import type { JsonObject } from "../json.js";
import type {
  ArchiveTypeData,
  EntryData,
} from "../route/contract/resolved-entry.js";
import type { ConnectedCdn } from "../runtime/contract/slots.js";
import type { AccessPolicy } from "./policy.js";
import { defineBlock } from "../blocks/index.js";
import { BlockRenderer, useUser } from "../blocks/renderer/index.js";
import {
  responseAllowsSharedStorage,
  SEGMENT_KEY_PARAM,
} from "../cdn/decision.js";
import { definePlugin } from "../plugin/define.js";
import {
  entry,
  fallback,
  forArchiveType,
} from "../route/render/template-builders.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { ACCESS_POLICY_META_KEY } from "./contract/meta-key.js";
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

// Two archive types standing in for policied public routes: one
// authenticated-only, one gated to `editor`. The route-level `access` policy is
// the seam under test end-to-end.
interface GatedData extends ArchiveTypeData {
  readonly kind: "archiveType";
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
      data: { kind: "archiveType", name: "members", label: "members-area" },
      title: "Members",
    }),
  });
  ctx.registerArchiveType("staff", {
    routes: ["/staff"],
    access: rolePolicy("editor"),
    resolve: () => ({
      data: { kind: "archiveType", name: "staff", label: "staff-area" },
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
      config: { plugins: [gatedPlugin], theme: gatedTheme },
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
      config: { plugins: [gatedPlugin], theme: gatedTheme },
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      await authed(h, "/members", subscriber.id),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="members"');
  });

  test("denies an under-privileged visitor at a role gate with a 403", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [gatedPlugin], theme: gatedTheme },
    });
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(await authed(h, "/staff", subscriber.id));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-plumix-challenge")).toBe("forbidden");
  });

  test("admits a sufficiently-privileged visitor at a role gate", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [gatedPlugin], theme: gatedTheme },
    });
    const editor = await h.seedUser("editor");
    const response = await h.dispatch(await authed(h, "/staff", editor.id));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="staff"');
  });

  test("leaves an un-policied route untouched", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [gatedPlugin], theme: gatedTheme },
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
    const h = await createDispatcherHarness({
      config: { plugins: [articlesPlugin] },
    });
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
    const h = await createDispatcherHarness({
      config: { plugins: [articlesPlugin] },
    });
    await seedArticle(h);
    const subscriber = await h.seedUser("subscriber");
    const response = await h.dispatch(
      await authed(h, "/article/gated", subscriber.id),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gated Article");
    // With no cdn binding, the copy sent to the client is always live and
    // per-visitor: an `authenticated` render carries `private, no-store` so a
    // downstream intermediary never shares it under the plain URL.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

// A real in-memory CDN: `match`/`put` key on the request URL, exactly as
// the Workers Cache API does, so the segment folded into the key by #1740 is
// what separates (or collapses) entries.
function memoryCdn() {
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
  const cdn: ConnectedCdn = {
    // Conforming rather than an identity: these tests turn on what a segment
    // render leaves carrying, so a decorate that widened would have to fail
    // here rather than pass by doing nothing.
    decorate: (response, tags) => {
      if (response.headers.has("set-cookie")) return response;
      if (!responseAllowsSharedStorage(response)) return response;
      const headers = new Headers(response.headers);
      if (!headers.has("cache-control")) {
        headers.set("cache-control", "public, s-maxage=60");
      }
      if (tags.length > 0) headers.set("cache-tag", tags.join(","));
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    },
    store: { match, put },
    purgeTags: vi.fn(() => Promise.resolve()),
  };
  return { cdn, store, match, put };
}

// An entry type whose single/archive routes require login and are cached
// under the shared `authenticated` segment (the "explicit opt-in" of #1740) …
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
  test("two subscribers in one segment share a single cdn entry keyed by segment", async () => {
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [membersPlugin] },
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
    if (key === undefined) throw new Error("expected a stored cdn entry");
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
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [membersPlugin] },
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

  test("a shared-segment page leaves the origin unshared and untagged", async () => {
    const { cdn } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [membersPlugin] },
    });
    await seedEntry(h, "article", "gated");
    const sub = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await authed(h, "/article/gated", sub.id),
    );
    await h.drainDeferred();

    // The segment-keyed edge entry beside it is deliberately shared; this copy
    // is one member's, and decoration may only ever narrow what the render
    // declared. A downstream intermediary knows nothing of the segment axis.
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cache-tag")).toBeNull();
  });

  test("a private-granting policy is never read from or written to the cdn", async () => {
    const { cdn, store, match, put } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [privatePlugin] },
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
    const { cdn, match, put } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [membersPlugin] },
    });
    const sub = await h.seedUser("subscriber");

    // The front page carries no policy: a signed-in visitor bypasses the shared
    // cdn entirely, exactly as before this slice (no opt-in ⇒ private).
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
    "an ephemeral ?%s grant on a policied route bypasses the shared cdn",
    async (query) => {
      const { cdn, match, put } = memoryCdn();
      const h = await createDispatcherHarness({
        cdn,
        config: { plugins: [membersPlugin] },
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

// The theme echoes who it rendered for (a bearer client included), so a test
// can tell a signed-in body from the anonymous one.
const signedInEcho = defineTheme({
  templates: [
    entry(
      defineTemplate<EntryData>({
        render: ({ ctx }) => (
          <main data-testid="viewer">
            {ctx.user?.email ??
              (ctx.request.headers.has("authorization")
                ? "BEARER-CLIENT"
                : "ANONYMOUS")}
          </main>
        ),
      }),
    ),
    fallback(() => null),
  ],
});

// A type whose policy grants `anonymous` to every principal, signed-in ones
// included.
function anonymousGrantPlugin(policy: AccessPolicy) {
  return definePlugin("open-notes", (ctx) => {
    ctx.registerEntryType("note", {
      label: "Notes",
      isPublic: true,
      access: { default: policy },
    });
  });
}

// A developer's own policy that hands a signed-in principal the shared
// `anonymous` segment: the guard keys on the segment, not on the policy.
const customAnonymousGrant = definePolicy({
  resolve: () => grant("anonymous"),
});

describe("access gate — an anonymous grant to a privileged request (#2914)", () => {
  test.each([
    ["anonymousPolicy", anonymousPolicy],
    ["a custom policy granting anonymous", customAnonymousGrant],
  ])(
    "a signed-in render under %s is private and never stored",
    async (_name, policy) => {
      const { cdn, store, put } = memoryCdn();
      const h = await createDispatcherHarness({
        cdn,
        config: {
          plugins: [anonymousGrantPlugin(policy)],
          theme: signedInEcho,
        },
      });
      await seedEntry(h, "note", "open");
      const sub = await h.seedUser("subscriber");

      const signedIn = await h.dispatch(await authed(h, "/note/open", sub.id));
      await h.drainDeferred();

      expect(signedIn.status).toBe(200);
      expect(await signedIn.text()).toContain(sub.email);
      expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
      expect(put).not.toHaveBeenCalled();
      expect(store.size).toBe(0);

      const anonymous = await h.dispatch(
        new Request("https://cms.example/note/open"),
      );
      const body = await anonymous.text();
      expect(body).toContain("ANONYMOUS");
      expect(body).not.toContain(sub.email);
    },
  );

  test("a request with an Authorization header is private and never stored", async () => {
    const { cdn, store, put } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: {
        plugins: [anonymousGrantPlugin(anonymousPolicy)],
        theme: signedInEcho,
      },
    });
    await seedEntry(h, "note", "open");

    const response = await h.dispatch(
      new Request("https://cms.example/note/open", {
        headers: { authorization: "Bearer some-token" },
      }),
    );
    await h.drainDeferred();

    expect(await response.text()).toContain("BEARER-CLIENT");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);

    const anonymous = await h.dispatch(
      new Request("https://cms.example/note/open"),
    );
    const body = await anonymous.text();
    expect(body).toContain("ANONYMOUS");
    expect(body).not.toContain("BEARER-CLIENT");
  });

  test("an anonymous request is still stored and served from the store", async () => {
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: {
        plugins: [anonymousGrantPlugin(anonymousPolicy)],
        theme: signedInEcho,
      },
    });
    await seedEntry(h, "note", "open");

    await h.dispatch(new Request("https://cms.example/note/open"));
    await h.drainDeferred();

    // One entry, stored under the plain URL — no segment in the key.
    const plainUrl = "https://cms.example/note/open";
    expect([...store.keys()]).toEqual([plainUrl]);
    store.set(plainUrl, {
      response: new Response("STORED-ANONYMOUS", { status: 200 }),
      tags: [],
    });

    const second = await h.dispatch(
      new Request("https://cms.example/note/open"),
    );
    expect(await second.text()).toBe("STORED-ANONYMOUS");
  });
});

// The paywall: a soft gate. An active `entitlement:premium` gets the full
// render under one shared segment; everyone else (anonymous or lapsed) gets a
// teaser at their own segment — the same URL, a distinct cdn variant. A
// mutable `entitled` set stands in for the developer's per-request entitlement
// check (a `meta` flag, their own table, an external billing API), letting a
// test flip a subscription active/lapsed between requests.
interface PaywallData extends ArchiveTypeData {
  readonly kind: "archiveType";
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
        // Runs on every request, before the cdn lookup — its result is never
        // cached, so a lapsed entitlement is denied on the next request.
        resolve: (c) =>
          c.user && entitled.has(c.user.id)
            ? entitlement("premium")
            : challenge("subscribe", { soft: true }),
      }),
      // An archive type opts into caching so the teaser/full variants persist.
      cacheable: true,
      resolve: () => ({
        data: {
          kind: "archiveType",
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
    const h = await createDispatcherHarness({
      config: { plugins: [plugin], theme: theme },
    });
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

  test("two entitled principals share one full-variant cdn entry", async () => {
    const { cdn, store } = memoryCdn();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [plugin], theme: theme },
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
    if (key === undefined) throw new Error("expected a stored cdn entry");
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

  test("serves teaser and full as two cdn variants at one URL", async () => {
    const { cdn, store } = memoryCdn();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [plugin], theme: theme },
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

  test("a lapsed entitlement is denied on the next request without cdn busting", async () => {
    const { cdn, store } = memoryCdn();
    const { entitled, plugin, theme } = paywallSetup();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [plugin], theme: theme },
    });
    const member = await h.seedUser("subscriber");
    entitled.add(member.id);

    // While entitled: the full variant renders and is cached.
    const active = await h.dispatch(await authed(h, "/premium", member.id));
    await h.drainDeferred();
    expect(await active.text()).toContain('data-testid="full"');
    expect(store.size).toBe(1);

    // The subscription lapses (the external check now returns false). No cdn
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
// type default at the gate and in the cdn key — the load-bearing data seam of
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
  meta: JsonObject,
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
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin] },
    });
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
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin] },
    });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    const subscriber = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await authed(h, "/column/locked", subscriber.id),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("locked title");
  });

  test("a sibling entry with no choice stays public (precedence falls to the type default)", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin] },
    });
    await seedColumn(h, "open", {});

    const response = await h.dispatch(
      new Request("https://cms.example/column/open"),
    );
    // No per-entry choice → the `anonymous` type default → served publicly.
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("open title");
  });

  test("a rule naming a fixed entry gates its path by that entry's choice", async () => {
    const featured = definePlugin("featured", (ctx) => {
      ctx.registerRewriteRule("/featured/:id", {
        kind: "entry",
        entryType: "column",
        slug: "locked",
      });
    });
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin, featured] },
    });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    const subscriber = await h.seedUser("subscriber");

    const anonymous = await h.dispatch(
      new Request("https://cms.example/featured/abc"),
    );
    const member = await h.dispatch(
      await authed(h, "/featured/abc", subscriber.id),
    );

    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Ffeatured%2Fabc",
    );
    expect(member.status).toBe(200);
    expect(await member.text()).toContain("locked title");
  });

  test("a rule naming a fixed entry gates by that entry, not the one its captured slug names", async () => {
    const pinned = definePlugin("pinned", (ctx) => {
      ctx.registerRewriteRule("/pinned-locked/:slug", {
        kind: "entry",
        entryType: "column",
        slug: "locked",
      });
      ctx.registerRewriteRule("/pinned-open/:slug", {
        kind: "entry",
        entryType: "column",
        slug: "open",
      });
    });
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin, pinned] },
    });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    await seedColumn(h, "open", {});

    // Each path captures the slug of the *other* entry; the fixed one decides.
    const locked = await h.dispatch(
      new Request("https://cms.example/pinned-locked/open"),
    );
    const open = await h.dispatch(
      new Request("https://cms.example/pinned-open/locked"),
    );

    expect(locked.status).toBe(302);
    expect(open.status).toBe(200);
    expect(await open.text()).toContain("open title");
  });

  test("an unknown stored choice falls back to the type default, never granting less", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [perEntryPlugin] },
    });
    // A key the developer removed from the space: the gate falls back to the
    // type default (`anonymous`) rather than failing open to something laxer.
    await seedColumn(h, "stale", { [ACCESS_POLICY_META_KEY]: "ghost" });

    const response = await h.dispatch(
      new Request("https://cms.example/column/stale"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("stale title");
  });

  test("the cdn segment reflects the per-entry choice", async () => {
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [perEntryPlugin] },
    });
    await seedColumn(h, "locked", { [ACCESS_POLICY_META_KEY]: "members" });
    const sub = await h.seedUser("subscriber");

    await h.dispatch(await authed(h, "/column/locked", sub.id));
    await h.drainDeferred();

    // The gated entry caches under the `authenticated` segment its per-entry
    // policy resolved to — not the plain anonymous URL.
    expect(store.size).toBe(1);
    const key = [...store.keys()][0];
    if (key === undefined) throw new Error("expected a stored cdn entry");
    expect(new URL(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe(
      "authenticated",
    );
  });
});

// A shared segment stores one copy per segment, so a render that read the
// principal must never fill it (ADR 0030). Each fixture reads the principal
// from one seam of the render phase under `authenticatedPolicy`.
function memberArticles(blocks: readonly BlockSpec[]) {
  return definePlugin("member-articles", (ctx) => {
    ctx.registerEntryType("article", {
      label: "Articles",
      isPublic: true,
      access: { default: authenticatedPolicy },
    });
    for (const block of blocks) ctx.registerBlock(block);
  });
}

// Core's own program has no `plumix/blocks` façade to name the loader context,
// so each loader narrows the context the dispatcher hands it to what it reads.
const whoamiBlock = defineBlock({
  name: "acme/whoami",
  loaders: {
    email: ({ ctx }: { readonly ctx: unknown }) => {
      const { user } = ctx as Pick<AppContext, "user">;
      return Promise.resolve(user?.email ?? "nobody");
    },
  },
  render: ({ loaders }) => <p data-testid="whoami">{loaders.email}</p>,
});

// A loader that reads the request but never the principal.
const plainBlock = defineBlock({
  name: "acme/plain",
  loaders: {
    path: ({ ctx }: { readonly ctx: unknown }) => {
      const { request } = ctx as Pick<AppContext, "request">;
      return Promise.resolve(new URL(request.url).pathname);
    },
  },
  render: ({ loaders }) => <p data-testid="plain">{loaders.path}</p>,
});

const blocksTheme = defineTheme({
  templates: [
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
    fallback(() => null),
  ],
});

function Viewer() {
  return <p data-testid="viewer">{useUser()?.email ?? "nobody"}</p>;
}

const useUserTheme = defineTheme({
  templates: [entry(() => <Viewer />), fallback(() => null)],
});

const documentUserTheme = defineTheme({
  templates: [
    entry(
      defineTemplate<EntryData>({
        document: ({ ctx }) => ({ title: ctx.user?.email ?? "nobody" }),
        render: () => null,
      }),
    ),
    fallback(() => null),
  ],
});

async function seedArticleWith(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  blockName?: string,
) {
  const author = await h.seedUser("admin");
  return h.factory.entry.create({
    type: "article",
    slug: "gated",
    title: "gated title",
    content:
      blockName === undefined
        ? null
        : {
            version: "plumix.v2",
            blocks: [{ id: "n", name: blockName, attrs: {} }],
          },
    status: "published",
    authorId: author.id,
    parentId: null,
  });
}

function recordedSnapshots() {
  const snapshots: TelemetrySnapshot[] = [];
  const telemetry = {
    consumers: [
      {
        id: "in-test",
        onRequestEnd: (snapshot: TelemetrySnapshot) => {
          snapshots.push(snapshot);
        },
      },
    ],
  };
  const cdnRecords = () =>
    snapshots.map((snapshot) => snapshot.records.cdn?.map((r) => r.data));
  return { telemetry, cdnRecords };
}

describe("access gate — a render that reads the principal is personal (#2915)", () => {
  test.each([
    ["a block loader reading ctx.user", blocksTheme, "acme/whoami"],
    ["a theme component calling useUser()", useUserTheme, undefined],
    ["a document function reading ctx.user", documentUserTheme, undefined],
  ])(
    "%s keeps each member's render out of the shared entry",
    async (_seam, theme, blockName) => {
      const { cdn, store, put } = memoryCdn();
      const { telemetry, cdnRecords } = recordedSnapshots();
      const h = await createDispatcherHarness({
        cdn,
        config: { plugins: [memberArticles([whoamiBlock])], theme, telemetry },
      });
      await seedArticleWith(h, blockName);
      const alice = await h.seedUser("subscriber");
      const bob = await h.seedUser("subscriber");

      const first = await h.dispatch(
        await authed(h, "/article/gated", alice.id),
      );
      await h.drainDeferred();

      expect(first.status).toBe(200);
      expect(await first.text()).toContain(alice.email);
      expect(first.headers.get("cache-control")).toBe("private, no-store");
      expect(first.headers.get("vary")?.toLowerCase()).toContain("cookie");
      expect(put).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
      expect(cdnRecords()).toEqual([
        [
          {
            decision: "miss",
            stored: false,
            segment: "authenticated",
            originStore: true,
            personal: true,
          },
        ],
      ]);

      const second = await h.dispatch(
        await authed(h, "/article/gated", bob.id),
      );
      const body = await second.text();
      expect(body).toContain(bob.email);
      expect(body).not.toContain(alice.email);
    },
  );

  test("a render:document filter calling ctx.auth.can() keeps the render out of the shared entry", async () => {
    const { cdn, store, put } = memoryCdn();
    const can = vi.fn((ctx: AppContext) => ctx.auth.can("entry:article:read"));
    const headWriter = definePlugin("head-writer", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, requestCtx) => ({
        ...manifest,
        meta: [{ name: "can-read", content: String(can(requestCtx)) }],
      }));
    });
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([]), headWriter] },
    });
    await seedArticleWith(h);
    const alice = await h.seedUser("subscriber");
    const bob = await h.seedUser("subscriber");

    const first = await h.dispatch(await authed(h, "/article/gated", alice.id));
    await h.drainDeferred();
    const second = await h.dispatch(await authed(h, "/article/gated", bob.id));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    // Rendered twice: the second member never read the first member's copy.
    expect(can).toHaveBeenCalledTimes(2);
  });

  test("a document function reading ctx.tokenScopes keeps the render out of the shared entry", async () => {
    const { cdn, store, put } = memoryCdn();
    const theme = defineTheme({
      templates: [
        entry(
          defineTemplate<EntryData>({
            document: ({ ctx }) => ({
              title: ctx.tokenScopes === null ? "unscoped" : "scoped",
            }),
            render: () => null,
          }),
        ),
        fallback(() => null),
      ],
    });
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])], theme },
    });
    await seedArticleWith(h);
    const member = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await authed(h, "/article/gated", member.id),
    );
    await h.drainDeferred();

    expect(await response.text()).toContain("<title>unscoped</title>");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  test("a render that reads no principal is stored once and serves the next member", async () => {
    const { cdn, store } = memoryCdn();
    const { telemetry, cdnRecords } = recordedSnapshots();
    const h = await createDispatcherHarness({
      cdn,
      config: {
        plugins: [memberArticles([plainBlock])],
        theme: blocksTheme,
        telemetry,
      },
    });
    await seedArticleWith(h, "acme/plain");
    const alice = await h.seedUser("subscriber");
    const bob = await h.seedUser("subscriber");

    const first = await h.dispatch(await authed(h, "/article/gated", alice.id));
    await h.drainDeferred();

    expect(await first.text()).toContain("/article/gated");
    expect(store.size).toBe(1);
    expect(cdnRecords()).toEqual([
      [
        {
          decision: "miss",
          stored: true,
          segment: "authenticated",
          originStore: true,
        },
      ],
    ]);

    const [key] = [...store.keys()];
    if (key === undefined) throw new Error("expected a stored cdn entry");
    store.set(key, {
      response: new Response("SHARED-VARIANT", { status: 200 }),
      tags: [],
    });
    const second = await h.dispatch(await authed(h, "/article/gated", bob.id));
    expect(await second.text()).toBe("SHARED-VARIANT");
  });

  test("a policy resolver reading the principal to choose the segment does not make the render personal", async () => {
    const { cdn, store } = memoryCdn();
    const readers = definePlugin("readers", (ctx) => {
      ctx.registerEntryType("article", {
        label: "Articles",
        isPublic: true,
        access: {
          default: definePolicy({
            segments: ["readers"],
            resolve: (c) => {
              if (!c.user) return redirectToLogin();
              return c.auth.can("entry:article:read")
                ? grant("readers")
                : challenge("forbidden");
            },
          }),
        },
      });
      ctx.registerBlock(plainBlock);
    });
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [readers], theme: blocksTheme },
    });
    await seedArticleWith(h, "acme/plain");
    const member = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await authed(h, "/article/gated", member.id),
    );
    await h.drainDeferred();

    expect(response.status).toBe(200);
    const [key] = [...store.keys()];
    if (key === undefined) throw new Error("expected a stored cdn entry");
    expect(new URL(key).searchParams.get(SEGMENT_KEY_PARAM)).toBe("readers");
  });

  test("a staff member's render carries the admin bar and is personal", async () => {
    const { cdn, store, put } = memoryCdn();
    const { telemetry, cdnRecords } = recordedSnapshots();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])], telemetry },
    });
    await seedArticleWith(h);
    const editor = await h.seedUser("editor");

    const response = await h.dispatch(
      await authed(h, "/article/gated", editor.id),
    );
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-testid="plumix-admin-bar"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    expect(cdnRecords()[0]?.[0]).toMatchObject({ personal: true });
  });

  test("a member whose render would be personal still reads the segment's stored copy", async () => {
    const { cdn, store, put } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])], theme: useUserTheme },
    });
    await seedArticleWith(h);
    const editor = await h.seedUser("editor");
    const key = new URL("https://cms.example/article/gated");
    key.searchParams.set(SEGMENT_KEY_PARAM, "authenticated");
    store.set(key.href, {
      response: new Response("SHARED-VARIANT", { status: 200 }),
      tags: [],
    });

    const response = await h.dispatch(
      await authed(h, "/article/gated", editor.id),
    );
    await h.drainDeferred();

    expect(await response.text()).toBe("SHARED-VARIANT");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(1);
  });

  test("a subscriber's render carries no admin bar and fills the shared entry", async () => {
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])] },
    });
    await seedArticleWith(h);
    const member = await h.seedUser("subscriber");

    const response = await h.dispatch(
      await authed(h, "/article/gated", member.id),
    );
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("plumix-admin-bar");
    expect(store.size).toBe(1);
  });

  // The site resolves a member's saved locale on the public site; the request
  // alone resolves to the default.
  const savedLocale = {
    defaultLocale: "en",
    locales: ["en", "de"],
    resolveLocale: (_request: Request, user: { meta: JsonObject } | null) =>
      user?.meta.locale === "de"
        ? {
            code: "de",
            label: "German",
            direction: "ltr" as const,
            enabled: true,
          }
        : null,
  };

  test("a member whose saved locale differs from the request's gets a personal render", async () => {
    const { cdn, store, put } = memoryCdn();
    const { telemetry, cdnRecords } = recordedSnapshots();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])], i18n: savedLocale, telemetry },
    });
    await seedArticleWith(h);
    const member = await h.factory.user.create({
      role: "subscriber",
      meta: { locale: "de" },
    });

    const response = await h.dispatch(
      await authed(h, "/article/gated", member.id),
    );
    await h.drainDeferred();

    expect(await response.text()).toContain('<html lang="de"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(put).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    expect(cdnRecords()[0]?.[0]).toMatchObject({ personal: true });
  });

  test("a member whose preference resolves to the request's locale shares the entry", async () => {
    const { cdn, store } = memoryCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [memberArticles([])], i18n: savedLocale },
    });
    await seedArticleWith(h);
    const member = await h.factory.user.create({
      role: "subscriber",
      meta: { locale: "en" },
    });

    const response = await h.dispatch(
      await authed(h, "/article/gated", member.id),
    );
    await h.drainDeferred();

    expect(await response.text()).toContain('<html lang="en"');
    expect(store.size).toBe(1);
  });
});
