import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";

const MOVE_ASIDE_ATTEMPTS = 20;

const isCode = (error: unknown, ...codes: string[]): boolean =>
  error instanceof Error &&
  "code" in error &&
  codes.includes(String(error.code));

export const swapIntoPlace = async (
  staged: string,
  dest: string,
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    const aside = `${dest}.replaced-${randomUUID()}`;
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
        attempt >= MOVE_ASIDE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
};
