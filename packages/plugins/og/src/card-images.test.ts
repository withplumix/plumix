import type { ConnectedObjectStorage } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { memoryStorage } from "plumix";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CardRule } from "./card.js";
import type { CardNode } from "./renderer.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, seedEntry, seedMedia } from "./test/harness.js";

// Stands in for an uploaded file: what it decodes to does not matter to the
// walk, only that the bytes the bucket holds are the bytes the renderer gets.
const HERO_KEY = "media/2026/hero.png";
const HERO_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

// A 1x1 transparent GIF — small enough to write inline, which is the case data
// URIs exist for.
const DATA_URI =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** A bucket holding the hero image, and nothing else. */
function seededBucket(): ConnectedObjectStorage {
  return memoryStorage({ seed: { [HERO_KEY]: HERO_BYTES } }).connect({});
}

/** A card rendering `node`, read at request time so a test can seed first. */
function imageCard(node: () => CardNode): CardRule {
  return card.fallback().define({
    key: ({ data }) => cardKey.of("card", data.kind),
    render: node,
  });
}

/** The card served for one seeded entry. */
async function cardBody(harness: DispatcherHarness): Promise<string> {
  const id = await seedEntry(harness);
  return (await harness.fetch(`/_plumix/og/entry/${String(id)}.svg`)).text();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an image a card references", () => {
  test("reaches the renderer untouched when it is a data URI", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      cards: [imageCard(() => ({ type: "image", src: DATA_URI }))],
    });

    const body = await cardBody(harness);

    expect(body).toContain(DATA_URI);
    // Its bytes travel in the src, so nothing is resolved on its behalf.
    expect(fake.inputs[0]?.images).toEqual([]);
  });

  test("is dropped, never fetched, when nothing resolves it", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no fetching")));
    vi.stubGlobal("fetch", fetchSpy);
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      cards: [
        imageCard(() => ({
          type: "container",
          children: [
            { type: "text", text: "Hello World" },
            { type: "image", src: "https://elsewhere.example/pixel.png" },
          ],
        })),
      ],
    });

    const body = await cardBody(harness);

    expect(body).toContain("Hello World");
    expect(body).not.toContain("elsewhere.example");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("is read out of the bucket when the site's own storage addresses it", async () => {
    const storage = seededBucket();
    const src = await storage.url(HERO_KEY);
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [imageCard(() => ({ type: "image", src: src ?? "" }))],
    });

    const body = await cardBody(harness);

    expect(body).toContain(src);
    expect(fake.inputs[0]?.images).toEqual([{ src, data: HERO_BYTES }]);
  });

  // The whole guard on that branch: the key is sliced out of the `src`, and the
  // slot has to mint that exact URL back for it. Here it does not — the bucket
  // percent-encodes the separators — so a real key that a real object sits at
  // is still refused, because the URL naming it was not one the bucket would
  // have published.
  test("is refused when the bucket does not mint that URL for the key", async () => {
    const storage = seededBucket();
    const fake = createFakeRenderer();
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [
        imageCard(() => ({
          type: "image",
          src: `/_plumix/memory-storage/${HERO_KEY}`,
        })),
      ],
    });

    const body = await cardBody(harness);

    expect(body).not.toContain(HERO_KEY);
    expect(fake.inputs[0]?.images).toEqual([]);
  });

  test("is read out of the bucket when the media library proxies it", async () => {
    const storage = seededBucket();
    const fake = createFakeRenderer();
    // Assigned once the media row exists, which needs the app the card is
    // declared to. The card renders on request, long after both.
    let src = "";
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [imageCard(() => ({ type: "image", src }))],
    });
    src = `/_plumix/media/serve/${String(await seedMedia(harness, HERO_KEY))}`;

    const body = await cardBody(harness);

    expect(body).toContain(src);
    expect(fake.inputs[0]?.images).toEqual([{ src, data: HERO_BYTES }]);
  });

  test("is dropped when the media library has not published it", async () => {
    const storage = seededBucket();
    const fake = createFakeRenderer();
    let src = "";
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [
        imageCard(() => ({
          type: "container",
          children: [
            { type: "text", text: "Hello World" },
            { type: "image", src },
          ],
        })),
      ],
    });
    const draft = await seedMedia(harness, HERO_KEY, { status: "draft" });
    src = `/_plumix/media/serve/${String(draft)}`;

    const body = await cardBody(harness);

    expect(body).toContain("Hello World");
    expect(body).not.toContain(src);
    expect(fake.inputs[0]?.images).toEqual([]);
  });

  // The engine throws on bytes it cannot decode, which would cost the card its
  // whole render rather than one picture.
  test("is dropped when the upload behind it is not an image", async () => {
    const storage = seededBucket();
    const fake = createFakeRenderer();
    let src = "";
    const harness = await createHarness({
      renderer: fake.renderer,
      storage,
      cards: [imageCard(() => ({ type: "image", src }))],
    });
    const pdf = await seedMedia(harness, HERO_KEY, {
      mime: "application/pdf",
    });
    src = `/_plumix/media/serve/${String(pdf)}`;

    const body = await cardBody(harness);

    expect(body).not.toContain(src);
    expect(fake.inputs[0]?.images).toEqual([]);
  });

  // The root cause of all three advisories the no-fetch rule answers was a
  // render option taken from the URL. The server derives every one of them: the
  // URL names a card and carries nothing else.
  test("cannot be steered by anything in the request URL", async () => {
    const fake = createFakeRenderer();
    const harness = await createHarness({ renderer: fake.renderer });
    const id = await seedEntry(harness);
    const path = `/_plumix/og/entry/${String(id)}.svg`;

    const plain = await harness.fetch(path);
    const steered = await harness.fetch(
      `${path}?width=8000&height=8000&url=https%3A%2F%2Felsewhere.example%2Fp.png`,
    );

    expect(await steered.text()).toBe(await plain.text());
    expect(steered.headers.get("etag")).toBe(plain.headers.get("etag"));
    expect(fake.inputs.map((input) => input.width)).toEqual([1200]);
  });
});
