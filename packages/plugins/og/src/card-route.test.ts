import { ACCESS_POLICY_META_KEY } from "plumix";
import { eq } from "plumix/db";
import { entries } from "plumix/schema";
import { describe, expect, test } from "vitest";

import type { SeedEntryOverrides } from "./test/harness.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, seedEntry } from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";

describe("the card route", () => {
  test("serves a card from the default template with no theme configuration", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness);

    const response = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

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
    const path = `/_plumix/og/entry/${String(id)}.svg`;

    const first = await (await harness.fetch(path)).text();
    const second = await (await harness.fetch(path)).text();

    expect(second).toBe(first);
    expect(fake.inputs).toHaveLength(1);
  });

  test("renders every request when the deploy declared no storage", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      withStorage: false,
    });
    const id = await seedEntry(harness);
    const path = `/_plumix/og/entry/${String(id)}.svg`;

    await harness.fetch(path);
    const second = await harness.fetch(path);

    second.assertStatus(200);
    expect(fake.inputs).toHaveLength(2);
  });

  test("serves headers that let a client hold the card and check back", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);

    const { headers } = await harness.fetch(
      `/_plumix/og/entry/${String(id)}.svg`,
    );

    // Deliberately not `immutable`: the URL is stable while the card behind it
    // is not, so freshness rides the ETag rather than an age.
    expect(headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(headers.get("content-length")).not.toBeNull();
  });

  test("answers 304 when the client already holds the card", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);
    const path = `/_plumix/og/entry/${String(id)}.svg`;
    const etag = (await harness.fetch(path)).headers.get("etag");

    const revalidated = await harness.fetch(path, {
      headers: { "if-none-match": etag ?? "" },
    });

    // A 304 has to repeat what it refreshes, or the client comes away
    // revalidated but with nothing to hold.
    expect(revalidated.assertStatus(304).headers.get("etag")).toBe(etag);
    expect(revalidated.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  test("re-renders under a fresh entity tag when the title changes", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness, { title: "First Title" });
    const path = `/_plumix/og/entry/${String(id)}.svg`;
    const before = (await harness.fetch(path)).headers.get("etag");

    await harness.db
      .update(entries)
      .set({ title: "Second Title" })
      .where(eq(entries.id, id));
    const after = await harness.fetch(path);

    expect(after.headers.get("etag")).not.toBe(before);
    expect(await after.text()).toContain("Second Title");
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

    const response = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

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

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)).assertStatus(
      200,
    );
  });

  test.each([
    ["an unknown entry", "/_plumix/og/entry/4242.svg"],
    ["a path that is not an entry id", "/_plumix/og/entry/nope.svg"],
  ])("answers 404 for %s", async (_label, path) => {
    const harness = await createHarness();

    (await harness.fetch(path)).assertStatus(404);
  });

  test("names the format the renderer produces in the URL it serves", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/jpeg" }).renderer,
    });
    const id = await seedEntry(harness);

    const served = await harness.fetch(`/_plumix/og/entry/${String(id)}.jpg`);

    expect(served.assertStatus(200).headers.get("content-type")).toBe(
      "image/jpeg",
    );
  });

  test("answers 404 for an extension the renderer does not produce", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.png`)).assertStatus(
      404,
    );
  });

  test("answers 404 for a format that has no URL to serve a card at", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/avif" }).renderer,
    });
    const id = await seedEntry(harness);

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.avif`)).assertStatus(
      404,
    );
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

    await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

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

    const response = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

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
      const response = await harness.fetch(
        `/_plumix/og/entry/${String(id)}.svg`,
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

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)).assertStatus(
      404,
    );
  });

  test("leaves the site line off a card when the site has no title", async () => {
    const harness = await createHarness({ withSiteTitle: false });
    const id = await seedEntry(harness);

    const body = await (
      await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)
    ).text();

    expect(body).toContain("Hello World");
    expect(body).not.toContain("Example Site");
  });
});
