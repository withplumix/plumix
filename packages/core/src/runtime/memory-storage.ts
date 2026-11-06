import type { PlumixEnv } from "./contract/bindings.js";
import type {
  ConnectedObjectStorage,
  GetResult,
  ListOptions,
  ListResult,
  ObjectStorage,
  PresignedPutResult,
  PresignPutOptions,
  UrlOptions,
} from "./contract/slots.js";
import { now as currentTime } from "../clock.js";
import { bodyToBytes, toFreshArrayBuffer } from "../storage/body.js";

interface MemoryEntry {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly cacheControl?: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
  readonly etag: string;
  readonly uploaded: Date;
}

export interface MemoryStorageConfig {
  /** Default `/_plumix/memory-storage/`. */
  readonly publicUrlBase?: string;
  readonly seed?: Readonly<Record<string, Uint8Array>>;
}

/**
 * A bucket that is also its own HTTP endpoint: it answers the presigned PUT a
 * browser sends, and a GET of the stored object, at its public URL base.
 */
export interface ConnectedMemoryStorage extends ConnectedObjectStorage {
  /** Always under the public URL base. */
  url(key: string, opts?: UrlOptions): Promise<string>;
  /** Answers 404 for a path outside the URL base or a key not stored. */
  fetch(request: Request): Promise<Response>;
}

/** Binds against nothing, so the env is optional, as with `memoryKv()`. */
export interface MemoryObjectStorage extends ObjectStorage {
  /** What it was built with, so a test site rebuilds it empty for each test. */
  readonly options: MemoryStorageConfig;
  connect(env?: PlumixEnv): ConnectedMemoryStorage;
}

export function memoryStorage(
  config: MemoryStorageConfig = {},
): MemoryObjectStorage {
  const store = new Map<string, MemoryEntry>();
  const publicUrlBase = config.publicUrlBase ?? "/_plumix/memory-storage/";

  if (config.seed) {
    const now = currentTime();
    for (const [key, bytes] of Object.entries(config.seed)) {
      store.set(key, {
        bytes,
        etag: computeEtag(bytes),
        uploaded: now,
      });
    }
  }

  const connected: ConnectedMemoryStorage = {
    async put(key, body, opts) {
      const bytes = await bodyToBytes(body);
      store.set(key, {
        bytes,
        contentType: opts?.contentType,
        cacheControl: opts?.cacheControl,
        customMetadata: opts?.customMetadata,
        etag: computeEtag(bytes),
        uploaded: currentTime(),
      });
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async get(key, opts): Promise<GetResult | null> {
      const entry = store.get(key);
      if (!entry) return null;
      const slice = opts?.range
        ? entry.bytes.subarray(
            opts.range.offset,
            opts.range.offset + opts.range.length,
          )
        : entry.bytes;
      return {
        body: streamFromBytes(slice),
        size: slice.byteLength,
        contentType: entry.contentType,
        etag: entry.etag,
        customMetadata: entry.customMetadata,
        arrayBuffer: () => Promise.resolve(toFreshArrayBuffer(slice)),
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async head(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        size: entry.bytes.byteLength,
        contentType: entry.contentType,
        etag: entry.etag,
        customMetadata: entry.customMetadata,
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async delete(key) {
      store.delete(key);
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async list(prefix, opts: ListOptions = {}): Promise<ListResult> {
      const limit = Math.min(opts.limit ?? 1000, 1000);
      const filtered: {
        key: string;
        size: number;
        etag: string;
        uploaded: Date;
      }[] = [];
      for (const [key, entry] of store) {
        if (prefix && !key.startsWith(prefix)) continue;
        filtered.push({
          key,
          size: entry.bytes.byteLength,
          etag: entry.etag,
          uploaded: entry.uploaded,
        });
      }
      filtered.sort((a, b) => a.key.localeCompare(b.key));
      const startIndex = opts.cursor ? Number(opts.cursor) || 0 : 0;
      const page = filtered.slice(startIndex, startIndex + limit);
      const nextIndex = startIndex + page.length;
      return {
        items: page,
        cursor: nextIndex < filtered.length ? String(nextIndex) : undefined,
        truncated: nextIndex < filtered.length,
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async url(key, _opts?: UrlOptions): Promise<string> {
      return `${publicUrlBase}${encodeURIComponent(key)}`;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async presignPut(
      key,
      opts: PresignPutOptions,
    ): Promise<PresignedPutResult> {
      const expiresIn = opts.expiresIn ?? 300;
      return {
        url: `${publicUrlBase}${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": opts.contentType },
        expiresAt: Math.floor(currentTime().getTime() / 1000) + expiresIn,
      };
    },
    async fetch(request) {
      const key = keyOf(request.url, publicUrlBase);
      if (key === null) return new Response(null, { status: 404 });
      if (request.method === "PUT") {
        await connected.put(key, await request.arrayBuffer(), {
          contentType: request.headers.get("content-type") ?? undefined,
        });
        return new Response(null, { status: 200 });
      }
      const got = await connected.get(key);
      if (!got) return new Response(null, { status: 404 });
      const headers = new Headers();
      if (got.contentType) headers.set("content-type", got.contentType);
      return new Response(got.body, { headers });
    },
  };

  return {
    kind: "memory",
    options: config,
    connect: () => connected,
  };
}

/** The key a URL under `publicUrlBase` addresses, or `null` outside it. */
function keyOf(url: string, publicUrlBase: string): string | null {
  const { pathname } = new URL(url);
  const base = new URL(publicUrlBase, url).pathname;
  if (!pathname.startsWith(base) || pathname === base) return null;
  return decodeURIComponent(pathname.slice(base.length));
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** FNV-1a — fast, non-cryptographic, sufficient for dev cache validation. */
function computeEtag(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `"${bytes.byteLength.toString(16)}-${(hash >>> 0).toString(16)}"`;
}
