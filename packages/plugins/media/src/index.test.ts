import { describe, expect, test } from "vitest";

import { HookRegistry, installPlugins, memoryStorage } from "@plumix/core";
import { createDispatcherHarness, plumixRequest } from "@plumix/core/test";

import { DEFAULT_ACCEPTED_TYPES, media } from "./index.js";

async function install() {
  return installPlugins({ hooks: new HookRegistry(), plugins: [media()] });
}

describe("@plumix/plugin-media — registration", () => {
  test("registers the media entry type with attribution", async () => {
    const { registry } = await install();
    const m = registry.entryTypes.get("media");
    expect(m).toBeDefined();
    expect(m?.label).toBe("Media");
    expect(m?.isPublic).toBe(false);
    expect(m?.hasArchive).toBe(false);
    expect(m?.registeredBy).toBe("media");
  });

  test("derives entry:media:create at the contributor minRole", async () => {
    const { registry } = await install();
    expect(registry.capabilities.get("entry:media:create")?.minRole).toBe(
      "contributor",
    );
  });

  test("registers the `media` RPC router with the full procedure set", async () => {
    const { registry } = await install();
    const router = registry.rpcRouters.get("media");
    expect(router).toBeDefined();
    const procedures = router as Record<string, unknown>;
    expect(typeof procedures.createUploadUrl).toBe("object");
    expect(typeof procedures.confirm).toBe("object");
    expect(typeof procedures.list).toBe("object");
    expect(typeof procedures.update).toBe("object");
    expect(typeof procedures.delete).toBe("object");
  });

  test("registers the Media Library admin page in its own Library nav group", async () => {
    const { registry } = await install();
    const page = registry.adminPages.get("/media");
    expect(page).toBeDefined();
    expect(page?.title).toBe("Media Library");
    expect(page?.capability).toBe("entry:media:read");
    // Custom nav group between Entries (100) and Taxonomies (200) —
    // media isn't a content surface like Posts/Pages, so it doesn't
    // belong nested under "Entries".
    expect(page?.nav?.group).toEqual({
      id: "library",
      label: "Library",
      priority: 150,
    });
    expect(page?.nav?.label).toBe("Media Library");
    expect(page?.component).toBe("MediaLibrary");
  });

  test("declares the adminEntry chunk path the plumix vite plugin loads", () => {
    const descriptor = media();
    expect(descriptor.adminEntry).toBe(
      "node_modules/@plumix/plugin-media/dist/admin/index.js",
    );
  });

  test("DEFAULT_ACCEPTED_TYPES covers the headline file kinds, excludes SVG by default", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "video/mp4",
      "audio/mpeg",
      "application/zip",
    ]) {
      expect(DEFAULT_ACCEPTED_TYPES).toContain(mime);
    }
    // SVG is opt-in: scriptable XML can carry XSS, the magic-byte sniff
    // can prove it parses as `<svg>` but cannot prove it's safe to render.
    expect(DEFAULT_ACCEPTED_TYPES).not.toContain("image/svg+xml");
  });
});

interface OrpcErrorPayload {
  readonly message?: string;
  readonly data?: { readonly reason?: string };
}

interface RpcResult<TOutput> {
  readonly status: number;
  readonly output: TOutput | undefined;
  readonly error: OrpcErrorPayload | undefined;
}

async function rpcDispatch<TOutput>(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  procedure: string,
  input: Record<string, unknown>,
  userId: number | null,
): Promise<RpcResult<TOutput>> {
  const base = plumixRequest(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  const request =
    userId !== null ? await h.authenticateRequest(base, userId) : base;
  const response = await h.dispatch(request);
  const body = (await response.json().catch(() => ({}))) as {
    json?: unknown;
  };
  return {
    status: response.status,
    output: response.ok ? (body.json as TOutput) : undefined,
    error: response.ok ? undefined : (body.json as OrpcErrorPayload),
  };
}

interface CreateUploadUrlOutput {
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly headers: Record<string, string>;
  readonly mediaId: number;
  readonly storageKey: string;
  readonly expiresAt: number;
}

interface ConfirmOutput {
  readonly id: number;
  readonly url: string;
  readonly storageKey: string;
  readonly mime: string;
  readonly size: number;
}

describe("@plumix/plugin-media — media.createUploadUrl", () => {
  test("happy path: returns a presigned URL and creates a draft entry", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({
      plugins: [media()],
      storage,
    });
    const user = await h.seedUser("contributor");

    const { status, output } = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "cat.png", contentType: "image/png", size: 5 },
      user.id,
    );

    expect(status).toBe(200);
    expect(output?.method).toBe("PUT");
    expect(output?.uploadUrl).toMatch(/cat\.png|memory-storage/);
    expect(output?.headers["content-type"]).toBe("image/png");
    expect(typeof output?.mediaId).toBe("number");
    expect(output?.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
  });

  test("rejects unsupported mime types with UNSUPPORTED_MEDIA_TYPE (415)", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");
    const { status, error } = await rpcDispatch<unknown>(
      h,
      "media/createUploadUrl",
      {
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        size: 10,
      },
      user.id,
    );
    expect(status).toBe(415);
    expect((error as { data?: { mime?: string } }).data?.mime).toBe(
      "application/x-msdownload",
    );
  });

  test("rejects oversize uploads with PAYLOAD_TOO_LARGE (413)", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({
      plugins: [media({ maxUploadSize: 4 })],
      storage,
    });
    const user = await h.seedUser("contributor");
    const { status, error } = await rpcDispatch<unknown>(
      h,
      "media/createUploadUrl",
      { filename: "big.png", contentType: "image/png", size: 16 },
      user.id,
    );
    expect(status).toBe(413);
    expect(
      (error as { data?: { limit?: number; received?: number } }).data?.limit,
    ).toBe(4);
  });

  test("falls back to a worker-routed upload URL when presignPut is unavailable", async () => {
    // memoryStorage exposes presignPut, but we can stub it out by passing
    // a connected storage with the method removed — simulates the
    // production case where the R2 binding is attached but no S3
    // credentials are configured.
    const { h } = await setupBindingOnlyHarness();
    const user = await h.seedUser("contributor");
    const { status, output } = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "tiny.txt", contentType: "text/plain", size: 3 },
      user.id,
    );
    expect(status).toBe(200);
    expect(output?.uploadUrl).toMatch(/^\/_plumix\/media\/upload\/\d+$/);
    expect(output?.method).toBe("PUT");
    expect(output?.headers["content-type"]).toBe("text/plain");
    expect(output?.mediaId).toBeGreaterThan(0);
  });

  test("rejects users below the create capability with FORBIDDEN", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("subscriber");
    const { status } = await rpcDispatch(
      h,
      "media/createUploadUrl",
      { filename: "low.png", contentType: "image/png", size: 5 },
      user.id,
    );
    expect(status).toBe(403);
  });

  test("rejects anonymous callers with UNAUTHORIZED", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const { status } = await rpcDispatch(
      h,
      "media/createUploadUrl",
      { filename: "anon.png", contentType: "image/png", size: 5 },
      null,
    );
    expect(status).toBe(401);
  });
});

describe("@plumix/plugin-media — media.confirm", () => {
  test("flips the draft to published once a valid upload landed", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "cat.png", contentType: "image/png", size: 8 },
      user.id,
    );
    expect(created.status).toBe(200);
    if (!created.output) throw new Error("expected createUploadUrl output");
    const init = created.output;

    // PNG magic-byte signature — confirm sniffs the first bytes and
    // verifies they match the claimed mime.
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await storage.put(init.storageKey, pngHeader, { contentType: "image/png" });

    const confirmed = await rpcDispatch<ConfirmOutput>(
      h,
      "media/confirm",
      { id: init.mediaId },
      user.id,
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.output?.id).toBe(init.mediaId);
    expect(confirmed.output?.storageKey).toBe(init.storageKey);
    expect(confirmed.output?.mime).toBe("image/png");
    expect(confirmed.output?.size).toBe(8);
  });

  test("rejects + deletes the object when bytes don't match the claimed mime", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "fake.png", contentType: "image/png", size: 5 },
      user.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const init = created.output;

    // Claimed image/png but upload arbitrary bytes — magic-byte sniff
    // should catch this and delete the object before flipping the draft.
    await storage.put(init.storageKey, "hello", { contentType: "image/png" });
    expect(await storage.head(init.storageKey)).not.toBeNull();

    const confirm = await rpcDispatch(
      h,
      "media/confirm",
      { id: init.mediaId },
      user.id,
    );
    expect(confirm.status).toBe(409);
    expect(confirm.error?.data?.reason).toBe("mime_mismatch");
    // The object must have been deleted from storage so an attacker
    // can't re-trigger confirm or share the bucket-direct URL.
    expect(await storage.head(init.storageKey)).toBeNull();
  });

  test("CAS prevents double-publish: a second confirm on a published row returns already_confirmed", async () => {
    // Two confirms on the same draft race the magic-byte sniff but
    // exactly one must flip the row from draft → published. The
    // loser sees `already_confirmed`, not a silent stomp of
    // `publishedAt` or a duplicate publish.
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      {
        filename: "tile.png",
        contentType: "image/png",
        size: PNG_1X1_BYTES.byteLength,
      },
      user.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    await storage.put(created.output.storageKey, PNG_1X1_BYTES, {
      contentType: "image/png",
    });

    const first = await rpcDispatch(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      user.id,
    );
    expect(first.status).toBe(200);

    const second = await rpcDispatch(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      user.id,
    );
    expect(second.status).toBe(409);
    expect(second.error?.data?.reason).toBe("already_confirmed");
  });

  test("returns CONFLICT when the upload didn't actually land in storage", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "ghost.png", contentType: "image/png", size: 5 },
      user.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");

    // Skip the PUT — confirm should refuse to flip the draft to published.
    const confirm = await rpcDispatch(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      user.id,
    );
    expect(confirm.status).toBe(409);
    expect(confirm.error?.data?.reason).toBe("object_not_found");
  });

  test("rejects an upload that exceeds meta.size with PAYLOAD_TOO_LARGE (413)", async () => {
    // Bytes are not signed into the SigV4 query, so `meta.size` is
    // just the client's claim. confirm must verify via head() that
    // the actually-stored object isn't oversized — otherwise an
    // attacker who got a presigned URL could PUT arbitrary size.
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "big.png", contentType: "image/png", size: 8 },
      user.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    // Stuff 64 bytes of valid PNG header into a slot that claimed 8.
    await storage.put(created.output.storageKey, PNG_1X1_BYTES, {
      contentType: "image/png",
    });
    const confirm = await rpcDispatch(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      user.id,
    );
    expect(confirm.status).toBe(413);
    // Object should be deleted (defense-in-depth, no junk in bucket).
    expect(await storage.head(created.output.storageKey)).toBeNull();
  });

  test("returns FORBIDDEN for a different user's draft", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const other = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "cat.png", contentType: "image/png", size: 5 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const { mediaId } = created.output;

    const confirm = await rpcDispatch<ConfirmOutput>(
      h,
      "media/confirm",
      { id: mediaId },
      other.id,
    );
    expect(confirm.status).toBe(403);
  });

  test("editors with entry:media:edit_any cannot confirm someone else's draft (owner-only)", async () => {
    // Confirm finalizes someone else's pending upload — `edit_any` is
    // for editing existing assets, not for taking over a half-baked
    // draft. Even editor-tier users get 403 when they didn't author
    // the draft.
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const editor = await h.seedUser("editor");
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "x.png", contentType: "image/png", size: 5 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const confirm = await rpcDispatch<ConfirmOutput>(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      editor.id,
    );
    expect(confirm.status).toBe(403);
  });

  test("returns NOT_FOUND for a non-existent id", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("editor");
    const { status } = await rpcDispatch<ConfirmOutput>(
      h,
      "media/confirm",
      { id: 999_999 },
      user.id,
    );
    expect(status).toBe(404);
  });
});

interface MediaListItemOutput {
  readonly id: number;
  readonly title: string;
  readonly mime: string;
  readonly size: number;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly alt: string | null;
  readonly uploadedAt: string;
  readonly uploadedById: number;
}

interface MediaListOutput {
  readonly items: readonly MediaListItemOutput[];
  readonly hasMore: boolean;
}

async function seedPublishedMedia(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  storage: ReturnType<ReturnType<typeof memoryStorage>["connect"]>,
  userId: number,
  filename: string,
): Promise<{ id: number; storageKey: string }> {
  const created = await rpcDispatch<CreateUploadUrlOutput>(
    h,
    "media/createUploadUrl",
    { filename, contentType: "image/png", size: 8 },
    userId,
  );
  if (!created.output) throw new Error("expected createUploadUrl output");
  await storage.put(
    created.output.storageKey,
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    { contentType: "image/png" },
  );
  await rpcDispatch(h, "media/confirm", { id: created.output.mediaId }, userId);
  return {
    id: created.output.mediaId,
    storageKey: created.output.storageKey,
  };
}

describe("@plumix/plugin-media — media.list", () => {
  test("returns published media for any reader; thumbnail url is the storage url when no imageDelivery", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const reader = await h.seedUser("subscriber");
    await seedPublishedMedia(h, storage, owner.id, "alpha.png");
    await seedPublishedMedia(h, storage, owner.id, "beta.png");

    const result = await rpcDispatch<MediaListOutput>(
      h,
      "media/list",
      { limit: 10, offset: 0 },
      reader.id,
    );
    expect(result.status).toBe(200);
    expect(result.output?.items.length).toBe(2);
    expect(result.output?.hasMore).toBe(false);
    // Without an `imageDelivery` slot the thumbnail collapses to the
    // raw storage URL — same shape the client renders against.
    const first = result.output?.items[0];
    expect(first?.thumbnailUrl).toBe(first?.url);
    expect(first?.mime).toBe("image/png");
    // New fields surfaced for the drawer's "Uploaded" line + future
    // user-display join.
    expect(first?.uploadedById).toBe(owner.id);
    expect(typeof first?.uploadedAt).toBe("string");
    // ISO-8601 round-trip — a parser shouldn't NaN it.
    expect(Number.isNaN(new Date(first?.uploadedAt ?? "").getTime())).toBe(
      false,
    );
  });

  test("rejects readers without entry:media:read", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    // The default `subscriber` has read; explicitly drop the reader to
    // a role that can't even see the entry type. A user not in any
    // role wouldn't authenticate at all, so we just test the cap path
    // by seeding the row but reaching for a non-existent capability:
    // since `entry:media:read` is granted to subscriber+, this test
    // confirms anonymous (no session) is denied.
    const { status } = await rpcDispatch<MediaListOutput>(
      h,
      "media/list",
      { limit: 10, offset: 0 },
      null,
    );
    expect(status).toBe(401);
  });

  test("hasMore flag fires when there are more rows than the page", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");
    for (let i = 0; i < 3; i++) {
      await seedPublishedMedia(h, storage, user.id, `n${String(i)}.png`);
    }
    const page1 = await rpcDispatch<MediaListOutput>(
      h,
      "media/list",
      { limit: 2, offset: 0 },
      user.id,
    );
    expect(page1.output?.items.length).toBe(2);
    expect(page1.output?.hasMore).toBe(true);
    const page2 = await rpcDispatch<MediaListOutput>(
      h,
      "media/list",
      { limit: 2, offset: 2 },
      user.id,
    );
    expect(page2.output?.items.length).toBe(1);
    expect(page2.output?.hasMore).toBe(false);
  });
});

describe("@plumix/plugin-media — media.delete", () => {
  test("removes the row + the storage object for the owner", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "kill.png");
    expect(await storage.head(seeded.storageKey)).not.toBeNull();

    const result = await rpcDispatch<{ id: number }>(
      h,
      "media/delete",
      { id: seeded.id },
      owner.id,
    );
    expect(result.status).toBe(200);
    expect(result.output?.id).toBe(seeded.id);
    expect(await storage.head(seeded.storageKey)).toBeNull();
  });

  test("returns FORBIDDEN for a non-owner without entry:media:delete", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const other = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "x.png");

    const { status } = await rpcDispatch(
      h,
      "media/delete",
      { id: seeded.id },
      other.id,
    );
    expect(status).toBe(403);
    // Object stays untouched.
    expect(await storage.head(seeded.storageKey)).not.toBeNull();
  });

  test("editor (entry:media:delete cap) can remove other users' media", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const editor = await h.seedUser("editor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "y.png");

    const result = await rpcDispatch(
      h,
      "media/delete",
      { id: seeded.id },
      editor.id,
    );
    expect(result.status).toBe(200);
    expect(await storage.head(seeded.storageKey)).toBeNull();
  });

  test("returns NOT_FOUND for a non-existent id", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("editor");
    const { status } = await rpcDispatch(
      h,
      "media/delete",
      { id: 999_999 },
      user.id,
    );
    expect(status).toBe(404);
  });
});

describe("@plumix/plugin-media — media.update", () => {
  test("owner can set alt text on their own media", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "cat.png");

    const result = await rpcDispatch<{
      id: number;
      title: string;
      alt: string | null;
    }>(
      h,
      "media/update",
      { id: seeded.id, alt: "A black cat looking at the camera" },
      owner.id,
    );
    expect(result.status).toBe(200);
    expect(result.output?.alt).toBe("A black cat looking at the camera");

    // List query reflects the new alt.
    const listed = await rpcDispatch<MediaListOutput>(
      h,
      "media/list",
      { limit: 10, offset: 0 },
      owner.id,
    );
    expect(listed.output?.items[0]?.alt).toBe(
      "A black cat looking at the camera",
    );
  });

  test("returns FORBIDDEN for a non-owner without edit_any", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const other = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "x.png");

    const result = await rpcDispatch(
      h,
      "media/update",
      { id: seeded.id, alt: "snooped" },
      other.id,
    );
    expect(result.status).toBe(403);
  });

  test("rolls back the draft entry when presignPut throws", async () => {
    const stub = memoryStorage().connect({});
    // Replace presignPut with one that always throws — the procedure
    // should delete the draft entry it just inserted before propagating.
    (
      stub as { presignPut: (...args: unknown[]) => Promise<unknown> }
    ).presignPut = () => Promise.reject(new Error("simulated_presign_fail"));
    const h = await createDispatcherHarness({
      plugins: [media()],
      storage: stub,
    });
    const user = await h.seedUser("contributor");

    const before = await h.db.query.entries.findMany();
    const beforeCount = before.length;

    const result = await rpcDispatch(
      h,
      "media/createUploadUrl",
      { filename: "ghost.png", contentType: "image/png", size: 4 },
      user.id,
    );
    // The handler rethrows the underlying error; oRPC surfaces it as a
    // 500 because it isn't a typed CONFLICT/FORBIDDEN.
    expect(result.status).toBe(500);

    const after = await h.db.query.entries.findMany();
    expect(after.length).toBe(beforeCount);
  });
});

// PNG (1x1, transparent) for round-trip tests below — magic-byte sniff
// in `media.confirm` requires real PNG bytes, not synthetic noise.
const PNG_1X1_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

// Worker-routed upload tests share the same binding-only harness:
// memoryStorage with `presignPut` stripped so the plugin falls back
// to the worker route, plus the media plugin wired up through
// createDispatcherHarness. Each test then layers its own auth /
// request shape on top. The connected storage is returned alongside
// so tests can assert directly on what landed in the bucket.
async function setupBindingOnlyHarness(): Promise<{
  h: Awaited<ReturnType<typeof createDispatcherHarness>>;
  stub: ReturnType<ReturnType<typeof memoryStorage>["connect"]>;
}> {
  const stub = memoryStorage().connect({});
  delete (stub as { presignPut?: unknown }).presignPut;
  const h = await createDispatcherHarness({
    plugins: [media()],
    storage: stub,
  });
  return { h, stub };
}

describe("@plumix/plugin-media — worker-routed upload (presign-less mode)", () => {
  // Regression for the deployed-blog-doesn't-upload bug:
  // when only the R2 binding is configured (no S3 credentials), the
  // plugin used to throw `presign_not_supported` and the admin showed
  // an opaque error. The createUploadUrl → PUT → confirm flow has to
  // work end-to-end through the worker route in that mode.
  test("createUploadUrl → PUT to /_plumix/media/upload/<id> → confirm round-trips bytes through the worker", async () => {
    const { h, stub } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      {
        filename: "tile.png",
        contentType: "image/png",
        size: PNG_1X1_BYTES.byteLength,
      },
      owner.id,
    );
    expect(created.status).toBe(200);
    const out = created.output;
    if (!out) throw new Error("expected createUploadUrl output");
    expect(out.uploadUrl).toMatch(/^\/_plumix\/media\/upload\/\d+$/);

    // PUT bytes through the worker route — exactly what the browser
    // would do with the returned uploadUrl + headers.
    const put = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest(out.uploadUrl, {
          method: "PUT",
          headers: {
            ...out.headers,
            "content-length": String(PNG_1X1_BYTES.byteLength),
          },
          body: PNG_1X1_BYTES,
        }),
        owner.id,
      ),
    );
    expect(put.status).toBe(204);

    // Bytes really landed in storage.
    const obj = await stub.get(out.storageKey);
    if (!obj) throw new Error("expected storage object after worker PUT");
    expect(new Uint8Array(await obj.arrayBuffer())).toEqual(PNG_1X1_BYTES);

    // Confirm should now succeed — magic-byte sniff sees real PNG.
    const confirmed = await rpcDispatch<ConfirmOutput>(
      h,
      "media/confirm",
      { id: out.mediaId },
      owner.id,
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.output?.id).toBe(out.mediaId);
  });

  test("anonymous PUT to upload route is rejected with 401", async () => {
    const { h } = await setupBindingOnlyHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/media/upload/1", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: PNG_1X1_BYTES,
      }),
    );
    expect(response.status).toBe(401);
  });

  test("non-owner without edit_any cannot PUT to another user's draft", async () => {
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");
    const other = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      {
        filename: "tile.png",
        contentType: "image/png",
        size: PNG_1X1_BYTES.byteLength,
      },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");

    const response = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest(created.output.uploadUrl, {
          method: "PUT",
          headers: {
            ...created.output.headers,
            "content-length": String(PNG_1X1_BYTES.byteLength),
          },
          body: PNG_1X1_BYTES,
        }),
        other.id,
      ),
    );
    expect(response.status).toBe(403);
  });

  test("malformed id in URL path is rejected (400) before any DB hit", async () => {
    // Anchored regex on the id segment: scientific notation, leading
    // zeros, non-numeric tails, and trailing path segments all fail.
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");
    const cases = ["1e3", "0", "01", "1.5", "abc", "-1", " 1"];
    for (const idStr of cases) {
      const response = await h.dispatch(
        await h.authenticateRequest(
          plumixRequest(`/_plumix/media/upload/${encodeURIComponent(idStr)}`, {
            method: "PUT",
            headers: {
              "content-type": "image/png",
              "content-length": "1",
            },
            body: new Uint8Array([0x89]),
          }),
          owner.id,
        ),
      );
      expect(response.status, `idStr=${idStr}`).toBe(400);
    }
  });

  test("trailing path segment after id is rejected (400)", async () => {
    // The route is mounted with `/upload/*` wildcard — without
    // strict shape validation, `/upload/1/extra` would still hit the
    // handler. The handler enforces exact `/upload/<id>$`.
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");
    const response = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest("/_plumix/media/upload/1/extra", {
          method: "PUT",
          headers: { "content-type": "image/png", "content-length": "1" },
          body: new Uint8Array([0x89]),
        }),
        owner.id,
      ),
    );
    expect(response.status).toBe(400);
  });

  test("PUT without Content-Length is rejected (411)", async () => {
    // Without Content-Length the byte cap could only be enforced
    // mid-stream — and a chunked body could DOS the bucket. Require
    // it up front.
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      {
        filename: "tile.png",
        contentType: "image/png",
        size: PNG_1X1_BYTES.byteLength,
      },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const req = await h.authenticateRequest(
      plumixRequest(created.output.uploadUrl, {
        method: "PUT",
        headers: created.output.headers,
        body: PNG_1X1_BYTES,
      }),
      owner.id,
    );
    // `Request` may set Content-Length automatically when given a
    // typed body; explicitly strip it for this test.
    req.headers.delete("content-length");
    expect(req.headers.get("content-length")).toBeNull();
    const response = await h.dispatch(req);
    expect(response.status).toBe(411);
  });

  test("PUT with Content-Length over meta.size is rejected (413)", async () => {
    // We trust Content-Length as the size cap — HTTP framing only
    // delivers up to CL bytes, and an honest CL is enforced by the
    // 413 check before any byte hits storage.
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "tile.png", contentType: "image/png", size: 8 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const response = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest(created.output.uploadUrl, {
          method: "PUT",
          headers: {
            ...created.output.headers,
            "content-length": "999",
          },
          body: PNG_1X1_BYTES,
        }),
        owner.id,
      ),
    );
    expect(response.status).toBe(413);
  });

  test("declared content-type that doesn't match the draft's mime is rejected", async () => {
    const { h } = await setupBindingOnlyHarness();
    const owner = await h.seedUser("contributor");

    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      {
        filename: "tile.png",
        contentType: "image/png",
        size: PNG_1X1_BYTES.byteLength,
      },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");

    const response = await h.dispatch(
      await h.authenticateRequest(
        plumixRequest(created.output.uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(PNG_1X1_BYTES.byteLength),
          },
          body: PNG_1X1_BYTES,
        }),
        owner.id,
      ),
    );
    expect(response.status).toBe(415);
  });
});

describe("@plumix/plugin-media — worker-proxied serve route", () => {
  // The serve route is keyed on entry id (NOT storage key) so it can
  // enforce `status='published'` before streaming bytes. Anyone with
  // a leaked storage key would otherwise be able to fetch draft
  // bytes (the bytes exist in R2 between PUT and confirm).
  test("GET /_plumix/media/serve/<id> returns published media bytes with security headers", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "serve.png");

    const response = await h.dispatch(
      plumixRequest(`/_plumix/media/serve/${String(seeded.id)}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // Image mimes render inline; only non-images get attachment.
    expect(response.headers.get("content-disposition")).toBeNull();
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });

  test("draft entries return 404 — only published is reachable", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    // Create a draft via createUploadUrl, PUT bytes, but DON'T confirm.
    // The bytes exist in storage at meta.storageKey, but the entry
    // is still `draft` — serve route MUST refuse it.
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "draft.png", contentType: "image/png", size: 8 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    await storage.put(
      created.output.storageKey,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      { contentType: "image/png" },
    );
    const response = await h.dispatch(
      plumixRequest(`/_plumix/media/serve/${String(created.output.mediaId)}`),
    );
    expect(response.status).toBe(404);
  });

  test("non-existent id returns 404", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const response = await h.dispatch(
      plumixRequest("/_plumix/media/serve/999999"),
    );
    expect(response.status).toBe(404);
  });

  test("malformed id returns 400 (rejects scientific notation, leading zeros, traversal attempts)", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    for (const idStr of ["1e3", "abc", "0", "01", "..%2Fetc", "1/extra"]) {
      const response = await h.dispatch(
        plumixRequest(`/_plumix/media/serve/${encodeURIComponent(idStr)}`),
      );
      expect(response.status, `idStr=${idStr}`).toBeGreaterThanOrEqual(400);
      expect(response.status, `idStr=${idStr}`).toBeLessThan(500);
    }
  });

  test("non-image mimes are forced to attachment disposition (XSS defense)", async () => {
    // Even with magic-byte sniff catching obvious HTML in `text/*`,
    // the serve route adds Content-Disposition: attachment to force
    // download instead of inline render — same-origin defense.
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const created = await rpcDispatch<CreateUploadUrlOutput>(
      h,
      "media/createUploadUrl",
      { filename: "notes.txt", contentType: "text/plain", size: 5 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    await storage.put(
      created.output.storageKey,
      new TextEncoder().encode("hello"),
      { contentType: "text/plain" },
    );
    await rpcDispatch(
      h,
      "media/confirm",
      { id: created.output.mediaId },
      owner.id,
    );
    const response = await h.dispatch(
      plumixRequest(`/_plumix/media/serve/${String(created.output.mediaId)}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  test("anonymous GET works — published media is publicly embeddable", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const seeded = await seedPublishedMedia(h, storage, owner.id, "pub.png");
    const response = await h.dispatch(
      plumixRequest(`/_plumix/media/serve/${String(seeded.id)}`),
    );
    expect(response.status).toBe(200);
  });
});
