import type { ImageDelivery } from "plumix";
import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { ACCESS_POLICY_META_KEY } from "plumix";
import { eq } from "plumix/db";
import { entries } from "plumix/schema";
import { describe, expect, test } from "vitest";

import type { CardPreview } from "./preview.js";
import type { HarnessOptions } from "./test/harness.js";
import { card, cardKey } from "./index.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, seedEntry } from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";
const PHOTO = "https://media.example/hero.jpg";

const testDelivery: ImageDelivery = {
  kind: "test",
  url: (src, opts) =>
    `https://cdn.example/${String(opts?.width)}x${String(opts?.height)}/${src}`,
};

/**
 * A site with the preview registered, rendering to a raster format — a card
 * only reaches the head, and therefore the preview, in a format scrapers
 * render, which is what a fresh install ships.
 */
function previewHarness(
  options: HarnessOptions = {},
): Promise<DispatcherHarness> {
  return createHarness({
    renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
    preview: ["post", "gated", "secret", "column"],
    ...options,
  });
}

/** The preview as the editor's meta box asks for it. */
async function previewOf(
  harness: DispatcherHarness,
  id: number,
  user: User,
): Promise<CardPreview> {
  const response = await harness.fetch("/_plumix/rpc/og/preview", {
    as: user,
    json: { json: { entryId: id }, meta: [] },
  });
  response.assertStatus(200);
  const envelope = await response.json<{ json: CardPreview }>();
  return envelope.json;
}

/** The bytes behind a `data:` URI, decoded — the fake renderer writes text. */
function decode(src: string): string {
  return atob(src.slice(src.indexOf(",") + 1));
}

describe("the card preview in the entry editor", () => {
  test("renders the card for a draft, which has no published one", async () => {
    const harness = await previewHarness();
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, {
      title: "Not published yet",
      status: "draft",
    });

    const preview = await previewOf(harness, id, editor);

    expect(preview.outcome).toBe("card");
    expect(preview.src?.startsWith("data:image/png;base64,")).toBe(true);
    expect(decode(preview.src ?? "")).toContain("Not published yet");
    // The route serves published entries only, so nothing on disk could have
    // answered this — which is the point of rendering it here.
    expect(
      (
        await harness.fetch(`/_plumix/og/card/entry/${String(id)}.png`)
      ).assertStatus(404),
    ).toBeDefined();
  });

  test("re-renders after an edit rather than repeating the last answer", async () => {
    const harness = await previewHarness();
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { title: "First title" });

    const before = await previewOf(harness, id, editor);
    await harness.db
      .update(entries)
      .set({ title: "Second title" })
      .where(eq(entries.id, id));
    const after = await previewOf(harness, id, editor);

    expect(decode(before.src ?? "")).toContain("First title");
    expect(decode(after.src ?? "")).toContain("Second title");
  });

  test("reflects a published entry's pending edit, which lives on an autosave row", async () => {
    // On a type supporting autosave, an editor's meta edits to a *published*
    // entry route to a per-user draft row rather than the live one — so a
    // preview reading the live row would answer with the state before the
    // author's last change, which is the very question it is asked.
    const harness = await previewHarness({ imageDelivery: testDelivery });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { status: "published" });

    expect((await previewOf(harness, id, editor)).outcome).toBe("card");

    const saved = await harness.fetch("/_plumix/rpc/entry/update", {
      as: editor,
      json: {
        json: { id, meta: { hero: { url: PHOTO, width: null, height: null } } },
        meta: [],
      },
    });
    saved.assertStatus(200);
    // The live row is untouched — the edit is pending, which is the shape the
    // preview has to see through.
    const [live] = await harness.db
      .select()
      .from(entries)
      .where(eq(entries.id, id));
    expect(live?.meta).toEqual({});

    expect(await previewOf(harness, id, editor)).toEqual({
      outcome: "featured",
      skipped: "featured-preferred",
      src: `https://cdn.example/1200x630/${PHOTO}`,
    });
  });

  test("names the entry's own share image, which outranks the card", async () => {
    const harness = await previewHarness();
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, {
      shareImage: { url: PHOTO, width: 800, height: 600 },
    });

    const preview = await previewOf(harness, id, editor);

    expect(preview).toEqual({
      outcome: "og-image",
      skipped: null,
      src: PHOTO,
    });
  });

  test("names the featured photo when the card steps aside for it", async () => {
    const harness = await previewHarness({ imageDelivery: testDelivery });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { featured: { url: PHOTO } });

    const preview = await previewOf(harness, id, editor);

    expect(preview).toEqual({
      outcome: "featured",
      skipped: "featured-preferred",
      src: `https://cdn.example/1200x630/${PHOTO}`,
    });
  });

  test("names the card where the theme's card outranks the photo", async () => {
    const harness = await previewHarness({
      imageDelivery: testDelivery,
      cards: [
        card.fallback().define({
          mode: "card",
          key: ({ data }) => cardKey.of(data.kind),
          render: () => ({ type: "text", text: "branded" }),
        }),
      ],
    });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { featured: { url: PHOTO } });

    const preview = await previewOf(harness, id, editor);

    expect(preview.outcome).toBe("card");
    expect(decode(preview.src ?? "")).toContain("branded");
  });

  test("names the site default where no card reaches the head", async () => {
    // An SVG renderer serves its route but never reaches a scraper, so the
    // page falls through — and the preview says what the page will say.
    // An SVG renderer serves its route but never reaches a scraper.
    const harness = await createHarness({
      preview: ["post"],
      siteDefaultImage: SITE_DEFAULT,
    });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness);

    const preview = await previewOf(harness, id, editor);

    expect(preview).toEqual({
      outcome: "site-default",
      skipped: "renderer-format",
      src: SITE_DEFAULT,
    });
  });

  test("says so when the page will be shared with no image at all", async () => {
    const harness = await createHarness({ preview: ["post"] });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness);

    expect(await previewOf(harness, id, editor)).toEqual({
      outcome: "site-default",
      skipped: "renderer-format",
      src: null,
    });
  });

  test("refuses a card for an entry no scraper could reach", async () => {
    // The status half of the shareable check is skipped so drafts preview;
    // the access half is not, or the preview names a card the head never
    // emits for this entry. Both gated shapes: by the type, and per entry.
    const harness = await previewHarness({ siteDefaultImage: SITE_DEFAULT });
    const editor = await harness.seedUser("editor");
    const gated = await seedEntry(harness, { type: "gated" });
    const perEntry = await seedEntry(harness, {
      type: "column",
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
    });

    const unreachable = {
      outcome: "site-default",
      skipped: "not-shareable",
      src: SITE_DEFAULT,
    };
    expect(await previewOf(harness, gated, editor)).toEqual(unreachable);
    expect(await previewOf(harness, perEntry, editor)).toEqual(unreachable);
  });

  test("refuses a card for an entry type that is not public", async () => {
    const harness = await previewHarness();
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { type: "secret" });

    expect(await previewOf(harness, id, editor)).toEqual({
      outcome: "site-default",
      skipped: "not-shareable",
      src: null,
    });
  });

  test("refuses an entry type the site did not ask for a preview on", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
      preview: ["gated"],
    });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness);

    const response = await harness.fetch("/_plumix/rpc/og/preview", {
      as: editor,
      json: { json: { entryId: id }, meta: [] },
    });

    expect(response.assertStatus(404)).toBeDefined();
  });

  test("refuses a caller who may not edit the entry", async () => {
    const harness = await previewHarness();
    const subscriber = await harness.seedUser("subscriber");
    const id = await seedEntry(harness);

    const response = await harness.fetch("/_plumix/rpc/og/preview", {
      as: subscriber,
      json: { json: { entryId: id }, meta: [] },
    });

    expect(response.assertStatus(403)).toBeDefined();
  });

  test("refuses an anonymous caller", async () => {
    const harness = await previewHarness();
    const id = await seedEntry(harness);

    const response = await harness.fetch("/_plumix/rpc/og/preview", {
      json: { json: { entryId: id }, meta: [] },
    });

    expect(response.assertStatus(401)).toBeDefined();
  });

  test("answers not-found for an entry that is not there", async () => {
    const harness = await previewHarness();
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch("/_plumix/rpc/og/preview", {
      as: editor,
      json: { json: { entryId: 999_999 }, meta: [] },
    });

    expect(response.assertStatus(404)).toBeDefined();
  });

  test("registers no meta box and no procedure until a site asks for one", async () => {
    const harness = await createHarness({
      renderer: createFakeRenderer({ contentType: "image/png" }).renderer,
    });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness);

    const response = await harness.fetch("/_plumix/rpc/og/preview", {
      as: editor,
      json: { json: { entryId: id }, meta: [] },
    });

    expect(response.assertStatus(404)).toBeDefined();
  });
});
