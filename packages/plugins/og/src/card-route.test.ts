import type { CdnStore, ConnectedCdn, Logger, TelemetrySpan } from "plumix";
import type { TestResponse } from "plumix/test";
import { ACCESS_POLICY_META_KEY } from "plumix/auth";
import { entryPurgeTags, entryTag, eq } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { describe, expect, test, vi } from "vitest";

import type { CardRenderer } from "./renderer.js";
import type { HarnessOptions, SeedEntryOverrides } from "./test/harness.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import {
  cardPath,
  createHarness,
  DEV_ORIGIN,
  fetchCard,
  headOf,
  ogImageOf,
  seedEntry,
} from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";

/**
 * The queries a request made for one entry row by id — the lookup the card
 * route resolves an entry card's live row through.
 */
function entryLookups(spans: readonly TelemetrySpan[]): string[] {
  return spans.flatMap((span) => {
    const sql = span.attributes["db.sql"];
    const own =
      typeof sql === "string" &&
      sql.includes('from "entries" where "entries"."id" = ?')
        ? [sql]
        : [];
    return [...own, ...entryLookups(span.children)];
  });
}

/**
 * One edit time for every seed a URL comparison makes, so the font set is the
 * only input that differs between the two cards.
 */
const UPDATED_AT = new Date("2026-01-01T00:00:00Z");

/**
 * The URL a card lands on for a given font set, under a renderer reading
 * `reads`.
 */
async function cardPathFor(
  fonts: readonly string[],
  reads?: CardRenderer["fonts"],
): Promise<string> {
  const harness = await createHarness({
    renderer: createFakeRenderer({ fonts: reads }).renderer,
    fonts,
  });
  return cardPath(harness, await seedEntry(harness, { updatedAt: UPDATED_AT }));
}

/** A logger that keeps what the route reported, for asserting on a failure. */
function collectingLogger(): {
  logged: { message: string; meta?: unknown }[];
  logger: Logger;
} {
  const logged: { message: string; meta?: unknown }[] = [];
  return {
    logged,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: (message, meta) => logged.push({ message, meta }),
    },
  };
}

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

    // `immutable` is safe because the URL carries the digest. No Set-Cookie:
    // the Cache API refuses to store a response with one.
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

    // Social image caches never see a purge, so only a new URL makes X,
    // Facebook and LinkedIn refetch.
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

    // A stale digest redirects rather than 404s, and never mints a storage or
    // edge entry of its own.
    const location = response.assertStatus(302).headers.get("location");
    expect(new URL(location ?? "").pathname).toBe(await cardPath(harness, id));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // A card carries the title and is served from a shared CDN at an enumerable
  // id, so any entry with no reachable page is refused.
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

  // A policied type must not cost every entry its card; a soft gate's public
  // teaser exists to unfurl.
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

    // The handler sees the mount stripped while the head adds it back, so each
    // must read the base path from its own side.
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

  test("reads no font at all for a renderer that declares it takes none", async () => {
    const asked: string[] = [];
    const fake = createFakeRenderer({ fonts: false });
    const harness = await createHarness({
      renderer: fake.renderer,
      fonts: ["/fonts/Inter-SemiBold.ttf"],
      assets: {
        fetch: (request) => {
          asked.push(new URL(request.url).pathname);
          return Promise.resolve(new Response(new Uint8Array([0, 1, 0, 0])));
        },
      },
    });
    const id = await seedEntry(harness);

    (await fetchCard(harness, id)).assertStatus(200);

    expect(asked).toEqual([]);
    expect(fake.inputs[0]?.fonts).toEqual([]);
  });

  test("renders for a fontless renderer on a runtime with no asset layer", async () => {
    // The configured set is not addressed to this renderer, so the absence of
    // somewhere to read it from is not this card's problem.
    const harness = await createHarness({
      renderer: createFakeRenderer({ fonts: false }).renderer,
      fonts: ["/fonts/Inter-SemiBold.ttf"],
    });
    const id = await seedEntry(harness);

    (await fetchCard(harness, id)).assertStatus(200);
  });

  test("keeps a fontless renderer's card URL when the font set changes", async () => {
    // Nothing the renderer reads changed, so nothing the digest names did —
    // and no card is re-rendered, nor its predecessor orphaned in the bucket.
    expect(await cardPathFor(["/fonts/A.ttf"], false)).toBe(
      await cardPathFor(["/fonts/B.ttf"], false),
    );
  });

  test("moves a font-reading renderer's card URL when the font set changes", async () => {
    expect(await cardPathFor(["/fonts/A.ttf"])).not.toBe(
      await cardPathFor(["/fonts/B.ttf"]),
    );
  });

  test("hands only the formats the renderer parses, in the configured order", async () => {
    const asked: string[] = [];
    const fake = createFakeRenderer({ fonts: { formats: ["woff2"] } });
    const harness = await createHarness({
      renderer: fake.renderer,
      fonts: ["/fonts/Inter.ttf", "/fonts/Inter.woff2", "/fonts/Fallback.otf"],
      assets: {
        fetch: (request) => {
          asked.push(new URL(request.url).pathname);
          return Promise.resolve(new Response(new Uint8Array([0, 1, 0, 0])));
        },
      },
    });
    const id = await seedEntry(harness);

    (await fetchCard(harness, id)).assertStatus(200);

    expect(asked).toEqual(["/fonts/Inter.woff2"]);
  });

  test("fails the card when no configured font is in a format the renderer reads", async () => {
    const { logged, logger } = collectingLogger();
    const harness = await createHarness({
      // What most font packages ship, against the bundled engine's formats.
      fonts: ["/fonts/Inter.woff2"],
      assets: {
        fetch: () => Promise.resolve(new Response(new Uint8Array([1]))),
      },
      siteDefaultImage: SITE_DEFAULT,
      logger,
    });
    const id = await seedEntry(harness);

    // Otherwise this would serve a textless card with a 200.
    const response = await fetchCard(harness, id);

    expect(response.assertStatus(302).headers.get("location")).toBe(
      SITE_DEFAULT,
    );
    expect(logged[0]?.message).toBe("og_card_render_failed");
    // Both halves, so this cannot pass on the path alone: what the renderer
    // does read, and which face was turned away for not being it.
    expect(logged[0]?.meta).toMatchObject({
      err: expect.stringContaining("ttf, otf, woff") as string,
    });
    expect(logged[0]?.meta).toMatchObject({
      err: expect.stringContaining("/fonts/Inter.woff2") as string,
    });
  });

  test("keeps a card's URL when an unreadable face is added to the set", async () => {
    // The renderer never receives the WOFF2 face, so it is not an input to the
    // bytes and must not move the URL that addresses them.
    expect(await cardPathFor(["/fonts/A.ttf"])).toBe(
      await cardPathFor(["/fonts/A.ttf", "/fonts/B.woff2"]),
    );
  });

  test("hands a failed render to the site default, and says what broke", async () => {
    const { logged, logger } = collectingLogger();
    const harness = await createHarness({
      fonts: ["/fonts/absent.ttf"],
      assets: {
        fetch: () => Promise.resolve(new Response(null, { status: 404 })),
      },
      siteDefaultImage: SITE_DEFAULT,
      logger,
    });
    const id = await seedEntry(harness);

    const response = await fetchCard(harness, id);

    // The head already promised this URL, so an error status breaks the unfurl;
    // redirect to the site default instead.
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
      // The dev error page is loopback-only, which is where a developer
      // opening the card URL is (#2007).
      const response = await harness.fetch(
        `${DEV_ORIGIN}${await cardPath(harness, id)}`,
        { headers: { accept: "text/html" } },
      );

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
  function cdnStub(seeded?: [string, Response]) {
    const entries = new Map<string, Response>(seeded ? [seeded] : []);
    const put = vi.fn<CdnStore["put"]>((request, response) => {
      entries.set(request.url, response);
      return Promise.resolve();
    });
    const match = vi.fn<CdnStore["match"]>((request) =>
      Promise.resolve(entries.get(request.url)?.clone()),
    );
    const cdn: ConnectedCdn = {
      decorate: (response) => response,
      store: { match, put },
      purgeTags: () => Promise.resolve(),
    };
    return { cdn, match, put };
  }

  test("stores the card under the tag the entry's own publish purges", async () => {
    const { cdn, put } = cdnStub();
    const harness = await createHarness({ cdn });
    const id = await seedEntry(harness);

    await fetchCard(harness, id);
    await harness.drainDeferred();

    // Asserted against core's purge vocabulary so `entry:published` and the
    // card's stored tags can't drift apart; the `site` tag is there because the
    // card prints the site name.
    const stored = [...(put.mock.calls[0]?.[2] ?? [])];
    expect(stored).toEqual(["s:site", entryTag(id)]);
    expect(entryPurgeTags("post", id)).toEqual(
      expect.arrayContaining(stored.filter((tag) => !tag.startsWith("s:"))),
    );
  });

  test("renders once, then answers the next request from the edge", async () => {
    const { cdn, match, put } = cdnStub();
    const fake = createFakeRenderer();
    const harness = await createHarness({ cdn, renderer: fake.renderer });
    const id = await seedEntry(harness);
    const path = await cardPath(harness, id);

    const first = await (await harness.fetch(path)).text();
    await harness.drainDeferred();
    const second = await harness.fetch(path);

    expect(await second.text()).toBe(first);
    expect(put).toHaveBeenCalledOnce();
    // Two lookups, one store: the second was answered from the edge. `cardPath`
    // resolves the pointer with a lookup of its own, hence the filter.
    const lookups = match.mock.calls.filter(
      ([request]) => new URL(request.url).pathname === path,
    );
    expect(lookups).toHaveLength(2);
    expect(fake.inputs).toHaveLength(1);
  });

  test("keeps a crafted query string from minting an entry of its own", async () => {
    const { cdn, put } = cdnStub();
    const harness = await createHarness({ cdn });
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
    const { cdn, match } = cdnStub([path, new Response("EDGE COPY")]);
    const harness = await createHarness({ cdn });

    const response = await harness.fetch(new URL(path).pathname);

    expect(await response.text()).toBe("EDGE COPY");
    expect(match).toHaveBeenCalledOnce();
  });

  test("hands a signed-in visitor the one entry everybody reads", async () => {
    const path = "https://cms.example/_plumix/og/card/entry/1/deadbeef.svg";
    const { cdn, match } = cdnStub([path, new Response("EDGE COPY")]);
    const harness = await createHarness({ cdn });
    const reader = await harness.seedUser("subscriber");

    const response = await harness.fetch(new URL(path).pathname, {
      as: reader,
    });

    // Session and locale cookies are scoped to `/_plumix/` so browsers send
    // them here; a card is the same for everyone, so they aren't a key axis.
    expect(await response.text()).toBe("EDGE COPY");
    expect(match.mock.calls[0]?.[0].headers.has("cookie")).toBe(false);
  });
});

describe("a card and the visitor's locale", () => {
  const I18N = { defaultLocale: "en", locales: ["en", "fr"] };

  // `resolveLocale` reads `Accept-Language` and the `/_plumix/` cookie on the
  // card route, not on the page whose head names it, so the two disagree.
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

    // Whoever asks first fixes a content-addressed URL's bytes for a year, and
    // no purge replaces them, so the card reads the site's locale.
    expect(body).toContain("locale:en");
  });
});

describe("a card and the page it shares", () => {
  const year = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
    new Date(),
  );

  // The card the page's own head names, fetched at the URL it names.
  async function cardFromHead(
    harness: Awaited<ReturnType<typeof createHarness>>,
    slug: string,
  ): Promise<{ url: string; response: TestResponse }> {
    const url = ogImageOf(await headOf(harness, slug)) ?? "";
    return { url, response: await harness.fetch(new URL(url).pathname) };
  }

  test("serves the head's card for a title carrying a shortcode, expanded", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
    });
    await seedEntry(harness, { slug: "best-of", title: "Best of [year]" });

    const { response } = await cardFromHead(harness, "best-of");

    const body = await response.assertStatus(200).text();
    expect(body).toContain(`<text>Best of ${year}</text>`);
    expect(body).not.toContain("[year]");
  });

  test("serves the head's card for a title shortcode reading a site setting", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
      before: [
        definePlugin("test_site_title", {
          setup: (ctx) => {
            ctx.registerShortcode({
              name: "site-title",
              render: ({ context }) => {
                const title = context.siteSettings.title;
                return typeof title === "string" ? title : "";
              },
            });
          },
        }),
      ],
    });
    await seedEntry(harness, { slug: "about", title: "About [site-title]" });

    const { response } = await cardFromHead(harness, "about");

    expect(await response.assertStatus(200).text()).toContain(
      "<text>About Example Site</text>",
    );
  });

  test("serves the head's card when a subscriber rewrites the page's title", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
      before: [
        definePlugin("test_retitle", {
          setup: (ctx) => {
            ctx.addFilter("resolve:single:data", (data) => ({
              ...data,
              entry: { ...data.entry, title: "Retitled in [year]" },
            }));
          },
        }),
      ],
    });
    const id = await seedEntry(harness, { slug: "hello-world" });

    const { url, response } = await cardFromHead(harness, "hello-world");

    expect(new URL(url).pathname).toBe(await cardPath(harness, id, "png"));
    expect(await response.assertStatus(200).text()).toContain(
      `<text>Retitled in ${year}</text>`,
    );
  });

  describe("rendered through a preview link", () => {
    // A theme card keyed on a field the editor drafts: the excerpt lands on
    // the author's autosave, not the live row, while the entry is published.
    const excerptCard = card.entry().define({
      key: ({ data }) => cardKey.of("excerpt", data.entry.excerpt ?? ""),
      render: ({ data }) => ({
        type: "text",
        text: `excerpt:${data.entry.excerpt ?? ""}`,
      }),
    });

    async function draftedExcerpt(options: HarnessOptions = {}) {
      const harness = await createHarness({
        renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
        cards: [excerptCard],
        ...options,
      });
      const editor = await harness.seedUser("editor");
      const id = await seedEntry(harness, {
        slug: "hello-world",
        excerpt: "Live excerpt",
      });
      const saved = await harness.fetch("/_plumix/rpc/entry/update", {
        as: editor,
        json: { json: { id, excerpt: "Drafted excerpt" }, meta: [] },
      });
      saved.assertStatus(200);
      const token = await harness.mintPreviewToken({
        entryId: id,
        userId: editor.id,
      });
      return { harness, token };
    }

    test("serves the head's card, computed from the live entry", async () => {
      const { harness, token } = await draftedExcerpt();

      const html = await (
        await harness.fetch(`/posts/hello-world?preview=${token}`)
      ).text();
      const url = ogImageOf(html) ?? "";
      const response = await harness.fetch(new URL(url).pathname);

      const body = await response.assertStatus(200).text();
      expect(body).toContain("excerpt:Live excerpt");
      expect(body).not.toContain("Drafted excerpt");
    });

    test("publishes the URL the public page publishes", async () => {
      const { harness, token } = await draftedExcerpt();

      const preview = ogImageOf(
        await (
          await harness.fetch(`/posts/hello-world?preview=${token}`)
        ).text(),
      );
      const published = ogImageOf(await headOf(harness, "hello-world"));

      expect(preview).toBeDefined();
      expect(preview).toBe(published);
    });

    test("is the only render that goes back for the live row", async () => {
      const lookups: string[][] = [];
      const { harness, token } = await draftedExcerpt({
        telemetry: {
          consumers: [
            {
              id: "entry-lookups",
              onRequestEnd: (snapshot) => {
                lookups.push(entryLookups(snapshot.spans));
              },
            },
          ],
        },
      });
      lookups.length = 0;

      await headOf(harness, "hello-world");
      await harness.fetch(`/posts/hello-world?preview=${token}`);
      await harness.drainDeferred();

      expect(lookups).toEqual([[], [expect.any(String)]]);
    });
  });
});
