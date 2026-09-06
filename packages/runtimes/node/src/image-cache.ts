import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { ReadStream } from "node:fs";

export interface CachedVariant {
  readonly size: number;
  readonly stream: ReadStream;
}

export interface VariantCache {
  /** Whether a variant `key` of `source` is held in any of `extensions`; counts as serving it. */
  touch(
    source: string,
    key: string,
    extensions: readonly string[],
  ): Promise<boolean>;
  /** The variant `key` of `source` in the first of `extensions` held, opened for reading. */
  open<E extends string>(
    source: string,
    key: string,
    extensions: readonly E[],
  ): Promise<{ readonly extension: E; readonly body: CachedVariant } | null>;
  /**
   * Counts the purges of `source` so far. A render takes it before it reads
   * the source and hands it to `put`, which then declines to keep a variant
   * of a source purged while the render was under way.
   */
  epoch(source: string): number;
  put(
    source: string,
    key: string,
    extension: string,
    bytes: Buffer,
    since: number,
  ): Promise<void>;
  /** Drops every variant of `source`. */
  purge(source: string): Promise<void>;
}

const VARIANT_FILE = /^[0-9a-f]+-[0-9a-f]+\.[a-z]+$/;

const sourcePrefix = (source: string): string =>
  `${createHash("sha256").update(source).digest("hex").slice(0, 40)}-`;

const fileName = (source: string, key: string, extension: string): string =>
  `${sourcePrefix(source)}${key}.${extension}`;

/**
 * Variants on disk under one directory, bounded by `maxBytes`. The index of
 * name to size is ordered least recently served first; a restart seeds it
 * from the directory in modification order, the nearest thing the files
 * themselves record.
 */
export function createVariantCache(
  dir: string,
  maxBytes: number,
): VariantCache {
  const index = new Map<string, number>();
  const epochs = new Map<string, number>();
  let total = 0;
  let ready: Promise<void> | undefined;

  async function seed(): Promise<void> {
    await mkdir(dir, { recursive: true });
    const found: { name: string; size: number; mtimeMs: number }[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !VARIANT_FILE.test(entry.name)) continue;
      const stats = await stat(join(dir, entry.name)).catch(() => null);
      if (stats === null) continue;
      found.push({
        name: entry.name,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
    found.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const { name, size } of found) remember(name, size);
  }

  // A failed seed is retried by the next call rather than remembered.
  function prepare(): Promise<void> {
    ready ??= seed().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  function remember(name: string, size: number): void {
    index.set(name, size);
    total += size;
  }

  function forget(name: string): void {
    const size = index.get(name);
    if (size === undefined) return;
    index.delete(name);
    total -= size;
  }

  async function drop(name: string): Promise<void> {
    forget(name);
    await rm(join(dir, name), { force: true });
  }

  async function evict(): Promise<void> {
    for (const name of index.keys()) {
      if (total <= maxBytes) return;
      await drop(name);
    }
  }

  const epoch = (source: string): number => epochs.get(source) ?? 0;

  return {
    async touch(source, key, extensions) {
      await prepare();
      for (const extension of extensions) {
        const name = fileName(source, key, extension);
        const size = index.get(name);
        if (size === undefined) continue;
        index.delete(name);
        index.set(name, size);
        return true;
      }
      return false;
    },

    async open(source, key, extensions) {
      await prepare();
      for (const extension of extensions) {
        const name = fileName(source, key, extension);
        const size = index.get(name);
        if (size === undefined) continue;
        // Opened before any header is decided: a directory emptied behind the
        // index is a miss, not a 200 with no body.
        const handle = await open(join(dir, name), "r").catch(() => null);
        if (handle === null) {
          forget(name);
          continue;
        }
        // Purged or evicted while it was being opened: a miss, not a
        // resurrection.
        if (!index.has(name)) {
          await handle.close();
          continue;
        }
        index.delete(name);
        index.set(name, size);
        return {
          extension,
          body: { size, stream: handle.createReadStream() },
        };
      }
      return null;
    },

    epoch,

    async put(source, key, extension, bytes, since) {
      await prepare();
      if (epoch(source) !== since) return;
      const name = fileName(source, key, extension);
      const file = join(dir, name);
      const staging = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(staging, bytes);
        await rename(staging, file);
      } catch (error) {
        await rm(staging, { force: true });
        throw error;
      }
      // A purge that landed during the write found nothing to drop.
      if (epoch(source) !== since) {
        await rm(file, { force: true });
        return;
      }
      forget(name);
      remember(name, bytes.byteLength);
      await evict();
    },

    async purge(source) {
      await prepare();
      epochs.set(source, epoch(source) + 1);
      const prefix = sourcePrefix(source);
      for (const name of index.keys()) {
        if (name.startsWith(prefix)) await drop(name);
      }
    },
  };
}
