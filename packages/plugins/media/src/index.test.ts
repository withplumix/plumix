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

  test("registers the `media` RPC router (createUploadUrl + confirm)", async () => {
    const { registry } = await install();
    const router = registry.rpcRouters.get("media");
    expect(router).toBeDefined();
    const procedures = router as Record<string, unknown>;
    expect(typeof procedures.createUploadUrl).toBe("object");
    expect(typeof procedures.confirm).toBe("object");
  });

  test("registers the Media Library admin page in the management nav group", async () => {
    const { registry } = await install();
    const page = registry.adminPages.get("/media");
    expect(page).toBeDefined();
    expect(page?.title).toBe("Media Library");
    expect(page?.capability).toBe("entry:media:read");
    expect(page?.nav?.group).toBe("management");
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

interface OrpcEnvelope<T> {
  readonly json?: T | OrpcErrorPayload;
}

interface OrpcErrorPayload {
  readonly defined?: boolean;
  readonly code?: string;
  readonly status?: number;
  readonly message?: string;
  readonly data?: { readonly reason?: string };
}

interface RpcResult<TOutput> {
  readonly status: number;
  readonly output: TOutput | undefined;
  readonly error: OrpcErrorPayload | undefined;
}

async function rpcDispatch<TInput, TOutput>(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  procedure: string,
  input: TInput,
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
  const body = (await response
    .json()
    .catch(() => ({}))) as OrpcEnvelope<TOutput>;
  if (response.ok) {
    return {
      status: response.status,
      output: body.json as TOutput | undefined,
      error: undefined,
    };
  }
  return {
    status: response.status,
    output: undefined,
    error: body.json as OrpcErrorPayload | undefined,
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

    const { status, output } = await rpcDispatch<
      { filename: string; contentType: string; size: number },
      CreateUploadUrlOutput
    >(
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
  test("flips the draft to published once the upload landed in storage", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<
      { filename: string; contentType: string; size: number },
      CreateUploadUrlOutput
    >(
      h,
      "media/createUploadUrl",
      { filename: "cat.png", contentType: "image/png", size: 5 },
      user.id,
    );
    expect(created.status).toBe(200);
    if (!created.output) throw new Error("expected createUploadUrl output");
    const init = created.output;

    // Simulate the browser's PUT having landed in storage.
    await storage.put(init.storageKey, "hello", { contentType: "image/png" });

    const confirmed = await rpcDispatch<{ id: number }, ConfirmOutput>(
      h,
      "media/confirm",
      { id: init.mediaId },
      user.id,
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.output?.id).toBe(init.mediaId);
    expect(confirmed.output?.storageKey).toBe(init.storageKey);
    expect(confirmed.output?.mime).toBe("image/png");
    expect(confirmed.output?.size).toBe(5);
  });

  test("returns CONFLICT when the upload didn't actually land in storage", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("contributor");

    const created = await rpcDispatch<
      { filename: string; contentType: string; size: number },
      CreateUploadUrlOutput
    >(
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

  test("returns NOT_FOUND for a different user's draft (uniform with non-existent ids)", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const owner = await h.seedUser("contributor");
    const other = await h.seedUser("contributor");

    const created = await rpcDispatch<
      { filename: string; contentType: string; size: number },
      CreateUploadUrlOutput
    >(
      h,
      "media/createUploadUrl",
      { filename: "cat.png", contentType: "image/png", size: 5 },
      owner.id,
    );
    if (!created.output) throw new Error("expected createUploadUrl output");
    const { mediaId } = created.output;

    const confirm = await rpcDispatch<{ id: number }, ConfirmOutput>(
      h,
      "media/confirm",
      { id: mediaId },
      other.id,
    );
    // 404 (not 403) — the procedure doesn't disclose the row's existence
    // to non-owners. Same code path as a non-existent id.
    expect(confirm.status).toBe(404);
  });

  test("returns NOT_FOUND for a non-existent id", async () => {
    const storage = memoryStorage().connect({});
    const h = await createDispatcherHarness({ plugins: [media()], storage });
    const user = await h.seedUser("editor");
    const { status } = await rpcDispatch<{ id: number }, ConfirmOutput>(
      h,
      "media/confirm",
      { id: 999_999 },
      user.id,
    );
    expect(status).toBe(404);
  });
});
