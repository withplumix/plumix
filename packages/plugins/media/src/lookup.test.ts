import { HookRegistry, installPlugins } from "plumix/plugin";
import { createRpcHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import { media } from "./index.js";
import { mediaLookupAdapter } from "./lookup.js";

// Seed a published `media` entry directly (not via media.createUploadUrl /
// confirm) so the adapter's contract is exercised in isolation.
interface SeedOptions {
  readonly title: string;
  readonly mime: string;
  readonly status?: "draft" | "published" | "trash";
  readonly authorId: number;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}

async function seedMedia(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  opts: SeedOptions,
): Promise<{ id: number }> {
  const entry = await h.factory.entry.create({
    type: "media",
    slug: `media-${opts.title.replace(/\s+/g, "-")}-${Math.random()}`,
    title: opts.title,
    status: opts.status ?? "published",
    authorId: opts.authorId,
    meta: {
      mime: opts.mime,
      size: 1024,
      storageKey: `media/${opts.title}`,
      originalName: opts.title,
      alt: opts.alt ?? null,
      width: opts.width ?? null,
      height: opts.height ?? null,
    },
  });
  return { id: entry.id };
}

async function harnessWithMediaPlugin() {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [media()],
  });
  return createRpcHarness({ authAs: "admin", plugins: registry });
}

describe("mediaLookupAdapter", () => {
  test("list({ ids }) returns published rows with label + mime subtitle", async () => {
    const h = await harnessWithMediaPlugin();
    const a = await seedMedia(h, {
      title: "cat.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const b = await seedMedia(h, {
      title: "dog.jpg",
      mime: "image/jpeg",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: [String(a.id), String(b.id)],
    });
    expect(rows).toHaveLength(2);
    const cat = rows.find((r) => r.id === String(a.id));
    expect(cat).toEqual({
      id: String(a.id),
      label: "cat.png",
      targetType: "media",
      subtitle: "image/png",
    });
  });

  test("list({ ids }) excludes draft media (asset bytes unverified)", async () => {
    const h = await harnessWithMediaPlugin();
    const draft = await seedMedia(h, {
      title: "wip.png",
      mime: "image/png",
      status: "draft",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: [String(draft.id)],
    });
    expect(rows).toEqual([]);
  });

  test("list({ ids }) excludes trashed media", async () => {
    const h = await harnessWithMediaPlugin();
    const trashed = await seedMedia(h, {
      title: "old.png",
      mime: "image/png",
      status: "trash",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: [String(trashed.id)],
    });
    expect(rows).toEqual([]);
  });

  test("list({ ids }) silently drops malformed ids before querying", async () => {
    const h = await harnessWithMediaPlugin();
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: ["", "abc", "0", "-1", "1.5"],
    });
    expect(rows).toEqual([]);
  });

  test("list({ query }) searches by title", async () => {
    const h = await harnessWithMediaPlugin();
    await seedMedia(h, {
      title: "alpha.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    await seedMedia(h, {
      title: "beta.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const matches = await mediaLookupAdapter.list(h.context, {
      query: "alpha",
    });
    expect(matches.find((r) => r.label === "alpha.png")).toBeDefined();
    expect(matches.find((r) => r.label === "beta.png")).toBeUndefined();
  });

  test("accept (prefix string) filters by MIME prefix", async () => {
    const h = await harnessWithMediaPlugin();
    const png = await seedMedia(h, {
      title: "img.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const pdf = await seedMedia(h, {
      title: "doc.pdf",
      mime: "application/pdf",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: [String(png.id), String(pdf.id)],
      scope: { accept: "image/" },
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(String(png.id));
    expect(ids).not.toContain(String(pdf.id));
  });

  test("accept (exact array) filters by exact MIME match", async () => {
    const h = await harnessWithMediaPlugin();
    const png = await seedMedia(h, {
      title: "a.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const jpg = await seedMedia(h, {
      title: "b.jpg",
      mime: "image/jpeg",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      ids: [String(png.id), String(jpg.id)],
      scope: { accept: ["image/png"] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(String(png.id));
  });

  test("browse path with `accept` set: LIMIT counts only matching rows (no silent under-fill)", async () => {
    // Mixed library: more PDFs than the LIMIT, plus a single image.
    // With JS post-filter the picker would fetch 3 rows, drop the
    // PDFs, and return 1 item — looking like "no more results" even
    // though more images exist further back. With SQL post-filter
    // the LIMIT counts only matching rows, so the picker sees the
    // image and the limit is respected.
    const h = await harnessWithMediaPlugin();
    for (let i = 0; i < 5; i++) {
      await seedMedia(h, {
        title: `pdf-${i}.pdf`,
        mime: "application/pdf",
        authorId: h.user.id,
      });
    }
    const image = await seedMedia(h, {
      title: "single.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.list(h.context, {
      limit: 3,
      scope: { accept: "image/" },
    });
    expect(rows.map((r) => r.id)).toEqual([String(image.id)]);
  });

  test("hydrate() resolves ids into media items with a URL", async () => {
    const h = await harnessWithMediaPlugin();
    const a = await seedMedia(h, {
      title: "cat.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(a.id)],
    });
    expect(rows).toEqual([
      {
        id: String(a.id),
        title: "cat.png",
        mime: "image/png",
        size: 1024,
        alt: null,
        // No storage adapter in the harness → same storageKey fallback
        // as `buildMediaItem`, keeping hydrate and media.get in agreement.
        url: "media/cat.png",
        thumbnailUrl: "media/cat.png",
        width: null,
        height: null,
      },
    ]);
  });

  test("hydrate() omits drafts and ids failing the accept scope", async () => {
    const h = await harnessWithMediaPlugin();
    const image = await seedMedia(h, {
      title: "ok.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const pdf = await seedMedia(h, {
      title: "doc.pdf",
      mime: "application/pdf",
      authorId: h.user.id,
    });
    const draft = await seedMedia(h, {
      title: "wip.png",
      mime: "image/png",
      status: "draft",
      authorId: h.user.id,
    });
    const rows = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(image.id), String(pdf.id), String(draft.id)],
      scope: { accept: "image/" },
    });
    expect(rows.map((r) => r.id)).toEqual([String(image.id)]);
  });

  test("image() reads url, alt and the measured pair off a hydrated image", async () => {
    const h = await harnessWithMediaPlugin();
    const cat = await seedMedia(h, {
      title: "cat.png",
      mime: "image/png",
      authorId: h.user.id,
      alt: "A cat",
      width: 1200,
      height: 630,
    });
    const [payload] = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(cat.id)],
    });
    expect(payload && mediaLookupAdapter.image(payload)).toEqual({
      url: "media/cat.png",
      alt: "A cat",
      width: 1200,
      height: 630,
    });
  });

  test("image() is null for a non-image mime", async () => {
    const h = await harnessWithMediaPlugin();
    const pdf = await seedMedia(h, {
      title: "doc.pdf",
      mime: "application/pdf",
      authorId: h.user.id,
    });
    const [payload] = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(pdf.id)],
    });
    expect(payload && mediaLookupAdapter.image(payload)).toBeNull();
  });

  // Hydrate never yields an empty URL (it falls back to the storage key), so
  // the payload is built by hand from a real one.
  test("image() is null for a payload with no URL", async () => {
    const h = await harnessWithMediaPlugin();
    const cat = await seedMedia(h, {
      title: "cat.png",
      mime: "image/png",
      authorId: h.user.id,
    });
    const [payload] = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(cat.id)],
    });
    expect(
      payload && mediaLookupAdapter.image({ ...payload, url: "" }),
    ).toBeNull();
  });

  test("image() drops a lone measured axis rather than send half a size", async () => {
    const h = await harnessWithMediaPlugin();
    const wide = await seedMedia(h, {
      title: "wide.png",
      mime: "image/png",
      authorId: h.user.id,
      width: 1200,
    });
    const [payload] = await mediaLookupAdapter.hydrate(h.context, {
      ids: [String(wide.id)],
    });
    expect(payload && mediaLookupAdapter.image(payload)).toStrictEqual({
      url: "media/wide.png",
      alt: null,
    });
  });
});
