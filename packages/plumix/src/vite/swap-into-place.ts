import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";

const ATTEMPTS = 100;

const isCode = (error: unknown, ...codes: string[]): boolean =>
  error instanceof Error &&
  "code" in error &&
  codes.includes(String(error.code));

const pauseBeforeRetry = (attempt: number): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * Math.min(50, attempt * 2)),
  );

export const swapIntoPlace = async (
  staged: string,
  dest: string,
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    // Beside the staged copy, not `dest`: the copy being replaced never
    // appears where a watcher of `dest`'s parent would see it.
    const aside = `${staged}.replaced-${randomUUID()}`;
    try {
      await rename(dest, aside);
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
    }
    try {
      await rename(staged, dest);
      await rm(aside, { recursive: true, force: true });
      return;
    } catch (error) {
      await rm(aside, { recursive: true, force: true });
      if (
        !isCode(error, "ENOTEMPTY", "EEXIST", "EPERM") ||
        attempt >= ATTEMPTS
      ) {
        throw error;
      }
      await pauseBeforeRetry(attempt);
    }
  }
};
