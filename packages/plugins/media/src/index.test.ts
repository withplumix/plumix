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

  test("registers the Media Library admin page in the management nav group", async () => {
    const { registry } = await install();
    const page = registry.adminPages.get("/media");
    expect(page).toBeDefined();
    expect(page?.title).toBe("Media Library");
    expect(page?.capability).toBe("entry:media:read");
    expect(page?.nav?.group).toBe("content");
    expect(page?.nav?.label).toBe("Media Library");
    expect(page?.component).toEqual({
      package: "@plumix/plugin-media",
      export: "MediaLibrary",
    });
  });

  test("declares the adminEntry chunk path the plumix vite plugin loads", () => {
    const descriptor = media();
    expect(descriptor.adminEntry).toBe(
      "node_modules/@plumix/plugin-media/dist/admin/index.js",
    );
  });

  test("DEFAULT_ACCEPTED_TYPES covers the headline file kinds", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/svg+xml",
      "application/pdf",
      "application/msword",
      "video/mp4",
      "audio/mpeg",
      "application/zip",
    ]) {
      expect(DEFAULT_ACCEPTED_TYPES).toContain(mime);
    }
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

  test("rejects unsupported mime types with a CONFLICT", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");
    const { status, error } = await rpcDispatch(
      h,
      "media/createUploadUrl",
      {
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        size: 10,
      },
      user.id,
    );
    expect(status).toBe(409);
    expect(error?.data?.reason).toBe("unsupported_media_type");
  });

  test("rejects oversize uploads with a CONFLICT", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({
      plugins: [media({ maxUploadSize: 4 })],
      storage,
    });
    const user = await h.seedUser("contributor");
    const { status, error } = await rpcDispatch(
      h,
      "media/createUploadUrl",
      { filename: "big.png", contentType: "image/png", size: 16 },
      user.id,
    );
    expect(status).toBe(409);
    expect(error?.data?.reason).toBe("payload_too_large");
  });

  test("returns CONFLICT when storage.presignPut is not available", async () => {
    // memoryStorage exposes presignPut, but we can stub it out by passing
    // a connected storage with the method removed.
    const stub = memoryStorage().connect({});
    delete (stub as { presignPut?: unknown }).presignPut;
    const h = await createDispatcherHarness({
      plugins: [media()],
      storage: stub,
    });
    const user = await h.seedUser("contributor");
    const { status, error } = await rpcDispatch(
      h,
      "media/createUploadUrl",
      { filename: "tiny.txt", contentType: "text/plain", size: 3 },
      user.id,
    );
    expect(status).toBe(409);
    expect(error?.data?.reason).toBe("presign_not_supported");
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
