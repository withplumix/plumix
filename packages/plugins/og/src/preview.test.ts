import type { ImageDelivery, JsonObject } from "plumix";
import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { ACCESS_POLICY_META_KEY } from "plumix/auth";
import { eq } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { describe, expect, test } from "vitest";

import type { CardPreview } from "./preview.js";
import type { HarnessOptions } from "./test/harness.js";
import { card, cardKey } from "./index.js";
import { CARD_PREVIEW_INPUT_TYPE } from "./preview-box.js";
import { createFakeRenderer } from "./test/fake-renderer.js";
import { createHarness, featuredMeta, seedEntry } from "./test/harness.js";

const SITE_DEFAULT = "https://cdn.example/site-default.png";
const PHOTO = "https://media.example/hero.jpg";

const testDelivery: ImageDelivery = {
  kind: "test",
  url: (src, opts) =>
    `https://cdn.example/${String(opts?.width)}x${String(opts?.height)}/${src}`,
};

/**
 * Renders to a raster format, since only a scraper-renderable card reaches the
 * head and therefore the preview.
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
    // Autosave routes meta edits on a published entry to a per-user draft row,
    // so reading the live row would miss the author's last change.
    const harness = await previewHarness({ imageDelivery: testDelivery });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { status: "published" });

    expect((await previewOf(harness, id, editor)).outcome).toBe("card");

    const saved = await harness.fetch("/_plumix/rpc/entry/update", {
      as: editor,
      json: {
        json: { id, meta: featuredMeta({ url: PHOTO }) },
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

  test("renders the title a page-data subscriber gives it, expanded", async () => {
    const harness = await previewHarness({
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
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness, { title: "Best of [year]" });
    const year = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
      new Date(),
    );

    const preview = await previewOf(harness, id, editor);

    expect(decode(preview.src ?? "")).toContain(
      `<text>Retitled in ${year}</text>`,
    );
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
    // An SVG renderer never reaches a scraper, so the page falls through and
    // the preview must say the same.
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
    // Drafts skip the status half of the shareable check but not the access
    // half, or the preview names a card the head never emits.
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

  test("answers from the live access choice, as the page does, not a pending one", async () => {
    // The gate reads policy from the persisted row, so an unsaved access pick
    // changes nothing yet.
    const harness = await previewHarness({ siteDefaultImage: SITE_DEFAULT });
    const editor = await harness.seedUser("editor");
    const drafted = async (
      meta: JsonObject,
      access: string | null,
    ): Promise<number> => {
      const id = await seedEntry(harness, { type: "column", meta });
      const saved = await harness.fetch("/_plumix/rpc/entry/update", {
        as: editor,
        json: { json: { id, access }, meta: [] },
      });
      saved.assertStatus(200);
      return id;
    };
    const toMembers = await drafted({}, "members");
    const toPublic = await drafted(
      { [ACCESS_POLICY_META_KEY]: "members" },
      null,
    );

    expect((await previewOf(harness, toMembers, editor)).outcome).toBe("card");
    expect(await previewOf(harness, toPublic, editor)).toEqual({
      outcome: "site-default",
      skipped: "not-shareable",
      src: SITE_DEFAULT,
    });
  });

  test("keeps an autosave's reserved keys out of the data it computes from", async () => {
    const harness = await previewHarness({
      before: [
        definePlugin("test_reserved", {
          setup: (ctx) => {
            ctx.addFilter("resolve:single:data", (data) => ({
              ...data,
              entry: {
                ...data.entry,
                title: `reserved:${Object.keys(data.entry.meta)
                  .filter((key) => key.startsWith("__plumix_"))
                  .join(",")}`,
              },
            }));
          },
        }),
      ],
    });
    const editor = await harness.seedUser("editor");
    const id = await seedEntry(harness);
    const saved = await harness.fetch("/_plumix/rpc/entry/update", {
      as: editor,
      json: { json: { id, excerpt: "Pending" }, meta: [] },
    });
    saved.assertStatus(200);

    const preview = await previewOf(harness, id, editor);

    expect(decode(preview.src ?? "")).toContain("<text>reserved:</text>");
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

describe("the card preview field type", () => {
  test("is contributed to the host's field vocabulary with the box", async () => {
    const harness = await previewHarness();

    expect(
      harness.app.plugins.fieldTypes.get(CARD_PREVIEW_INPUT_TYPE),
    ).toMatchObject({ registeredBy: "og" });
  });

  // No box, no admin chunk — and a declaration without the chunk would have
  // the manifest advertise a type nothing renders.
  test("is absent when no site asked for the box", async () => {
    const harness = await previewHarness({ preview: [] });

    expect(harness.app.plugins.fieldTypes.has(CARD_PREVIEW_INPUT_TYPE)).toBe(
      false,
    );
  });
});
