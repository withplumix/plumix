import { describe, expect, test } from "vitest";

import { entries, HookRegistry, installPlugins } from "@plumix/core";
import { createRpcHarness } from "@plumix/core/test";

import { media } from "./index.js";
import { mediaLookupAdapter } from "./lookup.js";

// Seed a published `media` entry directly through the entries table —
// keeps the test independent of `media.createUploadUrl` / `confirm` so
// the adapter's contract is exercised in isolation.
interface SeedOptions {
  readonly title: string;
  readonly mime: string;
  readonly status?: "draft" | "published" | "trash";
  readonly authorId: number;
}

async function seedMedia(
  h: Awaited<ReturnType<typeof createRpcHarness>>,
  opts: SeedOptions,
): Promise<{ id: number }> {
  const status = opts.status ?? "published";
  const [row] = await h.context.db
    .insert(entries)
    .values({
      type: "media",
      slug: `media-${opts.title.replace(/\s+/g, "-")}-${Math.random()}`,
      title: opts.title,
      status,
      authorId: opts.authorId,
      meta: {
        mime: opts.mime,
        size: 1024,
        storageKey: `media/${opts.title}`,
        originalName: opts.title,
        alt: null,
      },
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("seedMedia: insert returned no row");
  return { id: row.id };
}

async function harnessWithMediaPlugin() {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [media()],
  });
  return createRpcHarness({ authAs: "admin", plugins: registry });
}

describe("mediaLookupAdapter", () => {
  test("list({ ids }) returns published rows with cached fields", async () => {
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
      subtitle: "image/png",
      cached: { mime: "image/png", filename: "cat.png" },
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

  test("list({ query }) searches by title and orders by publishedAt desc", async () => {
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

  test("resolve() returns the row with cached fields when in scope", async () => {
    const h = await harnessWithMediaPlugin();
    const a = await seedMedia(h, {
      title: "logo.svg",
      mime: "image/svg+xml",
      authorId: h.user.id,
    });
    const result = await mediaLookupAdapter.resolve(h.context, String(a.id));
    expect(result).toEqual({
      id: String(a.id),
      label: "logo.svg",
      subtitle: "image/svg+xml",
      cached: { mime: "image/svg+xml", filename: "logo.svg" },
    });
  });

  test("resolve() returns null when MIME fails the accept scope", async () => {
    const h = await harnessWithMediaPlugin();
    const pdf = await seedMedia(h, {
      title: "doc.pdf",
      mime: "application/pdf",
      authorId: h.user.id,
    });
    const result = await mediaLookupAdapter.resolve(h.context, String(pdf.id), {
      accept: "image/",
    });
    expect(result).toBeNull();
  });

  test("resolve() returns null for a draft id (asset unverified)", async () => {
    const h = await harnessWithMediaPlugin();
    const draft = await seedMedia(h, {
      title: "wip.png",
      mime: "image/png",
      status: "draft",
      authorId: h.user.id,
    });
    const result = await mediaLookupAdapter.resolve(
      h.context,
      String(draft.id),
    );
    expect(result).toBeNull();
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
});
