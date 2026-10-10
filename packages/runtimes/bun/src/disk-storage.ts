import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type {
  ConnectedObjectStorage,
  GetOptions,
  GetResult,
  HeadResult,
  ListItem,
  ListResult,
  ObjectBody,
  ObjectStorage,
  PutOptions,
} from "plumix";

import { StorageError } from "./errors.js";

export interface DiskStorageConfig {
  /** The directory objects live under; created on first write. */
  readonly dir: string;
}

export interface DiskObjectStorage extends ObjectStorage {
  readonly config: DiskStorageConfig;
}

/** Beside the bytes, so `head` and `list` never read them. */
interface Sidecar extends HeadResult {
  readonly uploaded: string;
}

const MAX_PAGE = 1000;

interface Located {
  readonly key: string;
  readonly file: string;
  readonly sidecar: string;
}

function isMissing(error: unknown): boolean {
  return (error as { readonly code?: string }).code === "ENOENT";
}

/**
 * Every call opens its own `Bun.file`: a handle caches its stat, so one kept
 * across a delete still answers `exists()` for the file that is gone.
 */
async function readSidecar(path: string): Promise<Sidecar | null> {
  const sidecar = Bun.file(path);
  if (!(await sidecar.exists())) return null;
  return (await sidecar.json()) as Sidecar;
}

/**
 * The file is opened on the first read, so a body nobody consumes holds no
 * descriptor.
 */
function fileBody(
  file: string,
  range: GetOptions["range"],
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const whole = Bun.file(file);
        reader ??= (
          range ? whole.slice(range.offset, range.offset + range.length) : whole
        )
          .stream()
          .getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel: (reason) => reader?.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

/**
 * Single-node by design: `bunS3()` is the slot for a shared bucket. `url()` is
 * null, so media serves through its own route.
 */
export function diskStorage(config: DiskStorageConfig): DiskObjectStorage {
  const root = resolve(config.dir);
  const objects = join(root, "objects");
  const meta = join(root, "meta");
  const tmp = join(root, "tmp");

  // Two trees keyed by the same normalised path, so a key can never name
  // another key's sidecar.
  const locate = (key: string): Located => {
    const file = resolve(objects, key);
    if (!file.startsWith(objects + sep)) {
      throw StorageError.keyEscapesDirectory({ key });
    }
    const stored = relative(objects, file);
    return {
      key: stored.split(sep).join("/"),
      file,
      sidecar: `${join(meta, stored)}.json`,
    };
  };

  // Written under `tmp/` and renamed: `Bun.write` leaves partial output when
  // its body fails.
  const writeObject = async (
    located: Located,
    body: ObjectBody,
    opts: PutOptions | undefined,
  ): Promise<void> => {
    const hash = new Bun.CryptoHasher("sha1");
    let size = 0;
    // `Response` already knows every body shape the slot accepts; the lib
    // types the view generically, which is the only reason for the cast.
    const source = new Response(body as BodyInit | null).body;
    const counted = source?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          hash.update(chunk);
          size += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );
    const temp = join(tmp, crypto.randomUUID());
    try {
      await Bun.write(temp, new Response(counted ?? null));
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    const sidecar: Sidecar = {
      size,
      etag: `"${hash.digest("hex")}"`,
      uploaded: new Date().toISOString(),
      contentType: opts?.contentType,
      customMetadata: opts?.customMetadata,
    };
    const tempSidecar = join(tmp, crypto.randomUUID());
    await Bun.write(tempSidecar, JSON.stringify(sidecar));
    await Promise.all([
      mkdir(dirname(located.file), { recursive: true }),
      mkdir(dirname(located.sidecar), { recursive: true }),
    ]);
    await rename(temp, located.file);
    await rename(tempSidecar, located.sidecar);
  };

  const remove = async (path: string): Promise<void> => {
    try {
      await Bun.file(path).delete();
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  };

  const storedKeys = async (): Promise<string[]> => {
    const keys: string[] = [];
    try {
      for await (const path of new Bun.Glob("**").scan({
        cwd: objects,
        onlyFiles: true,
        dot: true,
      })) {
        keys.push(path.split(sep).join("/"));
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return keys;
  };

  const connected: ConnectedObjectStorage = {
    // `async`, so a refused key rejects the way the contract promises rather
    // than throwing out of the call.
    async put(key, body, opts) {
      await writeObject(locate(key), body, opts);
    },

    async get(key, opts): Promise<GetResult | null> {
      const located = locate(key);
      const stored = await readSidecar(located.sidecar);
      if (stored === null) return null;
      const range = opts?.range;
      const body = fileBody(located.file, range);
      return {
        ...stored,
        body,
        size: range
          ? Math.max(0, Math.min(range.length, stored.size - range.offset))
          : stored.size,
        arrayBuffer: () => new Response(body).arrayBuffer(),
      };
    },

    async head(key) {
      return readSidecar(locate(key).sidecar);
    },

    async delete(key) {
      const located = locate(key);
      await Promise.all([remove(located.file), remove(located.sidecar)]);
    },

    async list(prefix, opts = {}): Promise<ListResult> {
      const limit = Math.min(opts.limit ?? MAX_PAGE, MAX_PAGE);
      const { cursor } = opts;
      // The cursor is the last key served, so concurrent writes can't shift the
      // next page's start.
      const matching = (await storedKeys())
        .filter(
          (key) =>
            key.startsWith(prefix ?? "") &&
            (cursor === undefined || key > cursor),
        )
        .sort();
      const page = matching.slice(0, limit);
      const items: ListItem[] = [];
      for (const key of page) {
        const stored = await readSidecar(locate(key).sidecar);
        if (stored === null) continue;
        items.push({
          key,
          size: stored.size,
          etag: stored.etag,
          uploaded: new Date(stored.uploaded),
        });
      }
      const truncated = matching.length > page.length;
      return { items, cursor: truncated ? page.at(-1) : undefined, truncated };
    },

    url: () => Promise.resolve(null),
  };

  return { kind: "disk", config, connect: () => connected };
}
