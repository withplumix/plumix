import type { DispatcherHarness } from "plumix/test";
import { memoryStorage } from "plumix";
import { eq } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { OgPluginOptions } from "./index.js";
import { og } from "./index.js";
import { createFakeRenderer } from "./test/fake-renderer.js";

// A host plugin registering one public entry type and one private one, so the
// harness app has both a shareable page and an unshareable one.
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
  },
});

interface HarnessOptions extends OgPluginOptions {
  readonly withStorage?: boolean;
  readonly withSiteTitle?: boolean;
  readonly assets?: { fetch: (request: Request) => Promise<Response> };
}

async function createHarness(
  options: HarnessOptions = {},
): Promise<DispatcherHarness> {
  const { withStorage = true, withSiteTitle = true, assets, ...rest } = options;
  const harness = await createDispatcherHarness({
    plugins: [
      testBlog,
      og({ renderer: createFakeRenderer().renderer, ...rest }),
    ],
    storage: withStorage ? memoryStorage().connect({}) : undefined,
    assets,
  });
  if (withSiteTitle) {
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Example Site",
    });
  }
  return harness;
}

async function seedEntry(
  harness: DispatcherHarness,
  overrides: {
    readonly title?: string;
    readonly status?: "published" | "draft";
    readonly type?: string;
  } = {},
): Promise<number> {
  const author = await harness.factory.user.create({});
  const entry = await harness.factory.entry.create({
    type: overrides.type ?? "post",
    title: overrides.title ?? "Hello World",
    status: overrides.status ?? "published",
    authorId: author.id,
  });
  return entry.id;
}

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

  test.each([
    ["a draft entry", { status: "draft" as const }],
    ["an entry type the site does not publish", { type: "secret" }],
    ["an entry type nothing registers any more", { type: "ghost" }],
  ])("answers 404 for %s", async (_label, overrides) => {
    const harness = await createHarness();
    const id = await seedEntry(harness, overrides);

    const response = await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`);

    response.assertStatus(404);
  });

  test.each([
    ["an unknown entry", "/_plumix/og/entry/4242.svg"],
    ["a path that is not an entry id", "/_plumix/og/entry/nope.svg"],
  ])("answers 404 for %s", async (_label, path) => {
    const harness = await createHarness();

    (await harness.fetch(path)).assertStatus(404);
  });

  test("answers 404 for an extension the renderer does not produce", async () => {
    const harness = await createHarness();
    const id = await seedEntry(harness);

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.png`)).assertStatus(
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

  test("fails loudly when a declared font is missing from the asset layer", async () => {
    const harness = await createHarness({
      fonts: ["/fonts/absent.ttf"],
      assets: {
        fetch: () => Promise.resolve(new Response(null, { status: 404 })),
      },
    });
    const id = await seedEntry(harness);

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)).assertStatus(
      500,
    );
  });

  test("fails loudly when fonts are declared on a runtime with no asset layer", async () => {
    const harness = await createHarness({ fonts: ["/fonts/Inter.ttf"] });
    const id = await seedEntry(harness);

    (await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)).assertStatus(
      500,
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
