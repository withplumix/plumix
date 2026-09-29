import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BunFile } from "bun";

export interface VariantCache {
  /** The variant `key` of `source` in the first of `extensions` held on disk. */
  find<E extends string>(
    source: string,
    key: string,
    extensions: readonly E[],
  ): Promise<{ readonly extension: E; readonly file: BunFile } | null>;
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
    body: Blob,
    since: number,
  ): Promise<void>;
  /** Drops every variant of `source`. */
  purge(source: string): Promise<void>;
}

const sourcePrefix = (source: string): string =>
  `${new Bun.CryptoHasher("sha256").update(source).digest("hex").slice(0, 40)}-`;

/**
 * Variants on disk under one directory, each named by its source's hash and
 * its own, so a purge finds a source's variants by prefix. `Bun.write`
 * creates the directory on the first write.
 */
export function createVariantCache(dir: string): VariantCache {
  const epochs = new Map<string, number>();
  const path = (source: string, key: string, extension: string): string =>
    join(dir, `${sourcePrefix(source)}${key}.${extension}`);
  const epoch = (source: string): number => epochs.get(source) ?? 0;

  return {
    async find(source, key, extensions) {
      for (const extension of extensions) {
        // A fresh `Bun.file` per lookup: one caches its stat, and would go on
        // reporting a purged variant as present.
        const file = Bun.file(path(source, key, extension));
        if (await file.exists()) return { extension, file };
      }
      return null;
    },

    epoch,

    async put(source, key, extension, body, since) {
      if (epoch(source) !== since) return;
      const file = path(source, key, extension);
      // Written aside and renamed in, so a concurrent read never meets half a
      // variant.
      const staging = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await Bun.write(staging, body);
        await rename(staging, file);
      } catch (error) {
        await rm(staging, { force: true });
        throw error;
      }
      // A purge that landed during the write found nothing to drop.
      if (epoch(source) !== since) await rm(file, { force: true });
    },

    async purge(source) {
      epochs.set(source, epoch(source) + 1);
      const prefix = sourcePrefix(source);
      const names = await readdir(dir).catch(() => []);
      await Promise.all(
        names
          // A write still staging is left to the epoch check that ends it.
          .filter((name) => name.startsWith(prefix) && !name.endsWith(".tmp"))
          .map((name) => rm(join(dir, name), { force: true })),
      );
    },
  };
}
