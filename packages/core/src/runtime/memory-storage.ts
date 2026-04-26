import type {
  ConnectedObjectStorage,
  GetResult,
  ListOptions,
  ListResult,
  ObjectBody,
  ObjectStorage,
  PresignedPutResult,
  PresignPutOptions,
  UrlOptions,
} from "./slots.js";

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

export function memoryStorage(config: MemoryStorageConfig = {}): ObjectStorage {
  const store = new Map<string, MemoryEntry>();
  const publicUrlBase = config.publicUrlBase ?? "/_plumix/memory-storage/";

  if (config.seed) {
    const now = new Date();
    for (const [key, bytes] of Object.entries(config.seed)) {
      store.set(key, {
        bytes,
        etag: computeEtag(bytes),
        uploaded: now,
      });
    }
  }

  const connected: ConnectedObjectStorage = {
    async put(key, body, opts) {
      const bytes = await bodyToBytes(body);
      store.set(key, {
        bytes,
        contentType: opts?.contentType,
        cacheControl: opts?.cacheControl,
        customMetadata: opts?.customMetadata,
        etag: computeEtag(bytes),
        uploaded: new Date(),
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
        expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      };
    },
  };

  return {
    kind: "memory",
    connect: () => connected,
  };
}

async function bodyToBytes(body: ObjectBody): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body.slice();
  if (body instanceof ArrayBuffer) {
    const out = new Uint8Array(body.byteLength);
    out.set(new Uint8Array(body));
    return out;
  }
  if (ArrayBuffer.isView(body)) {
    const src = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    const out = new Uint8Array(src.byteLength);
    out.set(src);
    return out;
  }
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }
  // ReadableStream<Uint8Array>
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

// Avoids the `SharedArrayBuffer` union that `.slice()` introduces.
function toFreshArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// FNV-1a — fast, non-cryptographic, sufficient for dev cache validation.
function computeEtag(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `"${bytes.byteLength.toString(16)}-${(hash >>> 0).toString(16)}"`;
}
