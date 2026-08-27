import type { ConnectedCache } from "plumix";
import { ACCESS_POLICY_META_KEY, entryPurgeTags, entryTag } from "plumix";
import { eq } from "plumix/db";
import { entries } from "plumix/schema";
import { describe, expect, test, vi } from "vitest";

import type { SeedEntryOverrides } from "./test/harness.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import {
  cardPath,
  createHarness,
  fetchCard,
  seedEntry,
} from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";

describe("the card route", () => {
  test("serves a card from the default template with no theme configuration", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness);

    const response = await fetchCard(harness, id);

    expect(response.assertStatus(200).headers.get("content-type")).toBe(
      "image/svg+xml",
    );
    const body = await response.text();
    expect(body).toContain("Hello World");
    expect(body).toContain("Example Site");
  });

  test("renders once and reads the stored card back on the next request", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    const first = await (await harness.fetch(path)).text();
    const second = await (await harness.fetch(path)).text();

    expect(second).toBe(first);
    expect(fake.inputs).toHaveLength(1);
  });

  test("renders every request when the deploy declared no storage", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      storage: null,
    });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    await harness.fetch(path);
    const second = await harness.fetch(path);

    second.assertStatus(200);
    expect(fake.inputs).toHaveLength(2);
  });

  test("serves headers that let a client hold the card and check back", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);

    const { headers } = await fetchCard(harness, id);

    // `immutable` is honest here only because the URL carries the card's
    // digest: an edit publishes a different URL rather than changing what this
    // one answers. No `Vary` and no `Set-Cookie` go with it — the route reads
    // neither session nor locale, and the Cache API refuses to store a
    // response carrying a cookie.
    expect(headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(headers.get("vary")).toBeNull();
    expect(headers.get("set-cookie")).toBeNull();
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(headers.get("content-length")).not.toBeNull();
  });

  test("answers 304 when the client already holds the card", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);
    const etag = (await harness.fetch(path)).headers.get("etag");

    const revalidated = await harness.fetch(path, {
      headers: { "if-none-match": etag ?? "" },
    });

    // A 304 has to repeat what it refreshes, or the client comes away
    // revalidated but with nothing to hold.
    expect(revalidated.assertStatus(304).headers.get("etag")).toBe(etag);
    expect(revalidated.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("publishes a fresh URL when the title changes", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness, { title: "First Title" });
    const before = await cardPath(harness, id);

    await harness.db
      .update(entries)
      .set({ title: "Second Title" })
      .where(eq(entries.id, id));
    const after = await cardPath(harness, id);

    // The URL moving is the whole mechanism: a purge reaches Cloudflare, and
    // nothing reaches the image caches X, Facebook and LinkedIn keep, so the
    // only way to make them refetch is to give them a link they don't hold.
    expect(after).not.toBe(before);
    const served = await harness.fetch(after);
    expect(served.headers.get("etag")).not.toBe(
      (await harness.fetch(before)).headers.get("etag"),
    );
    expect(await served.text()).toContain("Second Title");
  });

  test("sends a superseded card URL on to the one that replaced it", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness, { title: "First Title" });
    const stale = await cardPath(harness, id);

    await harness.db
      .update(entries)
      .set({ title: "Second Title" })
      .where(eq(entries.id, id));
    const response = await harness.fetch(stale);

    // A scraper holding last week's URL gets pointed at this week's card
    // rather than a 404 — and a URL carrying a digest nothing rendered never
    // mints an entry of its own, in storage or at the edge.
    const location = response.assertStatus(302).headers.get("location");
    expect(new URL(location ?? "").pathname).toBe(await cardPath(harness, id));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // A card carries the entry's title, is served from a shared cache, and sits
  // at an enumerable id, so every entry with no page a scraper can reach has to
  // be refused — whether that is publication status, the type's visibility, or
  // the access layer turning an anonymous visitor away.
  test.each<[string, SeedEntryOverrides]>([
    ["a draft entry", { status: "draft" }],
    ["an entry type the site does not publish", { type: "secret" }],
    ["an entry type nothing registers any more", { type: "ghost" }],
    ["an entry its type gates behind sign-in", { type: "gated" }],
    [
      "an entry that selected a gating policy of its own",
      { type: "column", meta: { [ACCESS_POLICY_META_KEY]: "members" } },
    ],
  ])("answers 404 for %s", async (_label, overrides) => {
    const harness = await createHarness();
    const id = await seedEntry(harness, overrides);

    const response = await fetchCard(harness, id);

    response.assertStatus(404);
  });

  // The other side of the same rule: a policied *type* must not cost every
  // entry on it its card, and a soft gate serves a public teaser at 200 at the
  // plain URL — the whole point of which is that it unfurls.
  test.each<[string, SeedEntryOverrides]>([
    ["a sibling entry that selected nothing", { type: "column", meta: {} }],
    ["an entry behind a soft gate", { type: "teaser" }],
  ])("serves a card for %s", async (_label, overrides) => {
    const harness = await createHarness();
    const id = await seedEntry(harness, overrides);

    (await fetchCard(harness, id)).assertStatus(200);
  });

  test.each([
    ["an unknown entry", "/_plumix/og/card/entry/4242.svg"],
    ["a path that is not an entry id", "/_plumix/og/card/entry/nope.svg"],
  ])("answers 404 for %s", async (_label, path) => {
    const harness = await createHarness();

    (await harness.fetch(path)).assertStatus(404);
  });

  test("serves a card on a site mounted under a subdirectory", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
      basePath: "/blog",
    });
    const id = await seedEntry(harness, { slug: "hello-world" });

    const html = await (await harness.fetch("/blog/posts/hello-world")).text();
    const path = await cardPath(harness, id, "png", "/blog");

    // A route handler is given a request whose mount has already been stripped,
    // while the head has to put it back — so the two are only in step if each
    // reads the base path from the side it is on.
    expect(html).toContain(`content="https://cms.example${path}"`);
    (await harness.fetch(path)).assertStatus(200);
  });

  test("names the format the renderer produces in the URL it serves", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/jpeg" }).renderer,
    });
    const id = await seedEntry(harness);

    const served = await fetchCard(harness, id, { extension: "jpg" });

    expect(served.assertStatus(200).headers.get("content-type")).toBe(
      "image/jpeg",
    );
  });

  test("answers 404 for an extension the renderer does not produce", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);

    (await fetchCard(harness, id, { extension: "png" })).assertStatus(404);
  });

  test("answers 404 for a format that has no URL to serve a card at", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/avif" }).renderer,
    });
    const id = await seedEntry(harness);

    (await fetchCard(harness, id, { extension: "avif" })).assertStatus(404);
  });

  test("renders with the fonts the platform asset layer serves", async () => {
    const face = new Uint8Array([0x00, 0x01, 0x00, 0x00]);
    const asked: string[] = [];
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      fonts: ["/fonts/Inter-SemiBold.ttf"],
      assets: {
        fetch: (request) => {
          asked.push(new URL(request.url).pathname);
          return Promise.resolve(new Response(face));
        },
      },
    });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);

    expect(asked).toEqual(["/fonts/Inter-SemiBold.ttf"]);
    expect(fake.inputs[0]?.fonts).toEqual([face]);
  });

  test("hands a failed render to the site default, and says what broke", async () => {
    const logged: { message: string; meta?: unknown }[] = [];
    const harness = await createHarness({
      fonts: ["/fonts/absent.ttf"],
      assets: {
        fetch: () => Promise.resolve(new Response(null, { status: 404 })),
      },
      siteDefaultImage: SITE_DEFAULT,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: (message, meta) => logged.push({ message, meta }),
      },
    });
    const id = await seedEntry(harness);

    const response = await fetchCard(harness, id);

    // The head shipped this URL before anything rendered, so an error status
    // here is a broken unfurl on a page that promised an image. The scraper
    // gets the site's own default instead — and the failure still surfaces,
    // because nothing else about the response says a card is broken.
    expect(response.assertStatus(302).headers.get("location")).toBe(
      SITE_DEFAULT,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logged).toHaveLength(1);
    expect(logged[0]?.message).toBe("og_card_render_failed");
  });

  test("surfaces a failed render on the dev error page instead", async () => {
    const original = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    try {
      const harness = await createHarness({
        fonts: ["/fonts/absent.ttf"],
        assets: {
          fetch: () => Promise.resolve(new Response(null, { status: 404 })),
        },
        siteDefaultImage: SITE_DEFAULT,
      });
      const id = await seedEntry(harness);

      // What a developer opening the card URL in a browser sends.
      const response = await fetchCard(harness, id, {
        headers: { accept: "text/html" },
      });

      // A developer is the one looking at a card during development, and the
      // site default would hide the broken one behind something that works.
      const body = await response.assertStatus(500).text();
      expect(body).toContain("plumix-dev-error");
      expect(body).toContain("/fonts/absent.ttf");
    } finally {
      if (original === undefined) delete process.env.PLUMIX_DEV;
      else process.env.PLUMIX_DEV = original;
    }
  });

  test("answers 404 for a failed render on a site with no default", async () => {
    const harness = await createHarness({ fonts: ["/fonts/Inter.ttf"] });
    const id = await seedEntry(harness);

    (await fetchCard(harness, id)).assertStatus(404);
  });

  test("leaves the site line off a card when the site has no title", async () => {
    const harness = await createHarness({ withSiteTitle: false });
    const id = await seedEntry(harness);

    const body = await (await fetchCard(harness, id)).text();

    expect(body).toContain("Hello World");
    expect(body).not.toContain("Example Site");
  });
});

describe("a card at the edge", () => {
  function edgeStub(seeded?: [string, Response]) {
    const store = new Map<string, Response>(seeded ? [seeded] : []);
    const put = vi.fn<ConnectedCache["put"]>((request, response) => {
      store.set(request.url, response);
      return Promise.resolve();
    });
    const match = vi.fn<ConnectedCache["match"]>((request) =>
      Promise.resolve(store.get(request.url)?.clone()),
    );
    const cache: ConnectedCache = {
      match,
      put,
      purgeTags: () => Promise.resolve(),
    };
    return { cache, match, put };
  }

  test("stores the card under the tag the entry's own publish purges", async () => {
    const { cache, put } = edgeStub();
    const harness = await createHarness({ cache });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);
    await harness.drainDeferred();

    // The card key emits the URL hash and this tag from one call, so a card
    // keyed on an entry lands under the entry tag. Asserted against core's own
    // purge vocabulary rather than a spelled-out string: what makes this one
    // caching story is that the set an `entry:published` sweeps covers what
    // the card stored under, and either side moving has to break this.
    const stored = [...(put.mock.calls[0]?.[2] ?? [])];
    expect(stored).toEqual([entryTag(id)]);
    expect(entryPurgeTags("post", id)).toEqual(expect.arrayContaining(stored));
  });

  test("renders once, then answers the next request from the edge", async () => {
    const { cache, match, put } = edgeStub();
    const fake = createFakeRenderer();
    const harness = await createHarness({ cache, renderer: fake.renderer });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    const first = await (await harness.fetch(path)).text();
    await harness.drainDeferred();
    const second = await harness.fetch(path);

    expect(await second.text()).toBe(first);
    expect(put).toHaveBeenCalledOnce();
    // Looked up twice and stored once: the second request was answered out of
    // the edge entry the first one filled. (`cardPath` resolves the pointer,
    // which is a lookup of its own — hence the filter.)
    const lookups = match.mock.calls.filter(
      ([request]) => new URL(request.url).pathname === path,
    );
    expect(lookups).toHaveLength(2);
    expect(fake.inputs).toHaveLength(1);
  });

  test("keeps a crafted query string from minting an entry of its own", async () => {
    const { cache, put } = edgeStub();
    const harness = await createHarness({ cache });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    for (const junk of [0, 1, 2]) {
      await harness.fetch(`${path}?junk=${String(junk)}`);
    }
    await harness.drainDeferred();

    // The edge keys on the whole URL, so answering these would leave three
    // entries holding one card's immutable bytes — from an unauthenticated
    // route at an enumerable id.
    expect(put).not.toHaveBeenCalled();
  });

  test("answers from the stored copy without reaching the route", async () => {
    const path = "https://cms.example/_plumix/og/card/entry/1/deadbeef.svg";
    const { cache, match } = edgeStub([path, new Response("EDGE COPY")]);
    const harness = await createHarness({ cache });

    const response = await harness.fetch(new URL(path).pathname);

    expect(await response.text()).toBe("EDGE COPY");
    expect(match).toHaveBeenCalledOnce();
  });

  test("hands a signed-in visitor the one entry everybody reads", async () => {
    const path = "https://cms.example/_plumix/og/card/entry/1/deadbeef.svg";
    const { cache, match } = edgeStub([path, new Response("EDGE COPY")]);
    const harness = await createHarness({ cache });
    const reader = await harness.seedUser("subscriber");

    const response = await harness.fetch(new URL(path).pathname, {
      as: reader,
    });

    // Session and locale cookies are scoped to `/_plumix/`, so a signed-in
    // visitor's browser does send them here. A card is the same image for
    // everyone, so they are not a key axis — the cookie comes off the lookup
    // and the shared entry answers.
    expect(await response.text()).toBe("EDGE COPY");
    expect(match.mock.calls[0]?.[0].headers.has("cookie")).toBe(false);
  });
});

describe("a card and the visitor's locale", () => {
  const I18N = { defaultLocale: "en", locales: ["en", "fr"] };

  // A card keyed on the locale is the documented pattern, and the locale is
  // exactly what the two askers disagree about: `resolveLocale` reads
  // `Accept-Language` and the `Path=/_plumix/` cookie on the card's own route
  // and on neither the page the head renders on.
  const localeCard = card.fallback().define({
    key: ({ ctx }) => cardKey.of("card", ctx.locale.code),
    render: ({ ctx }) => ({ type: "text", text: `locale:${ctx.locale.code}` }),
  });

  test.each([
    ["an Accept-Language header", { headers: { "accept-language": "fr" } }],
    ["a locale cookie", { headers: { cookie: "plumix_locale=fr" } }],
  ])(
    "serves the card the head published to a scraper sending %s",
    async (_case, init) => {
      const harness = await createHarness({ cards: [localeCard], i18n: I18N });
      const id = await seedEntry(harness);
      const path = await cardPath(harness, id);

      const response = await harness.fetch(path, init);

      // Anything but a 200 here is a scraper redirected away from the image its
      // page promised, on every request it makes.
      response.assertStatus(200);
      expect(await response.text()).toContain("locale:en");
    },
  );

  test("refuses a locale asked for in the query rather than answering it", async () => {
    const harness = await createHarness({ cards: [localeCard], i18n: I18N });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    const response = await harness.fetch(`${path}?lang=fr`);

    const location = response.assertStatus(302).headers.get("location");
    expect(new URL(location ?? "").pathname).toBe(path);
  });

  test("renders every card in the site's own locale", async () => {
    const harness = await createHarness({ cards: [localeCard], i18n: I18N });
    const id = await seedEntry(harness);

    const body = await (
      await fetchCard(harness, id, { headers: { "accept-language": "fr" } })
    ).text();

    // Whoever asks first decides what is behind a content-addressed URL for a
    // year, and no purge replaces stored bytes under an unchanged key. So the
    // card reads the site's locale, not the visitor's.
    expect(body).toContain("locale:en");
  });
});
