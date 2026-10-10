import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { swapIntoPlace } from "./swap-into-place.js";

export interface StageIntoPlaceOptions {
  /** Where the private copy is built. */
  readonly stagingRoot: string;
  /** The directory the finished copy replaces. */
  readonly dest: string;
  /** Writes the complete copy into the directory it is given. */
  readonly populate: (dir: string) => Promise<void>;
}

/**
 * Skips an identical swap, which keeps a dev server's file watcher quiet when
 * nothing changed.
 */
export async function stageIntoPlace({
  stagingRoot,
  dest,
  populate,
}: StageIntoPlaceOptions): Promise<void> {
  await mkdir(stagingRoot, { recursive: true });
  const staging = resolve(stagingRoot, randomUUID());
  try {
    await populate(staging);
    if (await holdSameFiles(staging, dest)) return;
    await mkdir(dirname(dest), { recursive: true });
    await swapIntoPlace(staging, dest);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function holdSameFiles(a: string, b: string): Promise<boolean> {
  const [filesA, filesB] = await Promise.all([listFiles(a), listFiles(b)]);
  if (filesA === undefined || filesB === undefined) return false;
  if (filesA.join("\n") !== filesB.join("\n")) return false;
  for (const file of filesA) {
    const [bytesA, bytesB] = await Promise.all([
      readFile(resolve(a, file)),
      readFile(resolve(b, file)),
    ]);
    if (!bytesA.equals(bytesB)) return false;
  }
  return true;
}

async function listFiles(dir: string): Promise<string[] | undefined> {
  try {
    const entries = await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, resolve(entry.parentPath, entry.name)))
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
