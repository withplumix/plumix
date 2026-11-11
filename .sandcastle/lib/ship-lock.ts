import { randomUUID } from "node:crypto";
import { readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function lockOwner(path: string): string | undefined {
  try {
    return readlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function ownerIsAlive(owner: string): boolean {
  const pid = Number(owner.split(":")[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error(`Invalid ship lock owner: ${owner}`);
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

export function acquireShipLock(root: string): () => void {
  const path = join(root, "ship.lock");
  const owner = `${process.pid}:${randomUUID()}`;
  try {
    symlinkSync(owner, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const previous = lockOwner(path);
    if (previous && ownerIsAlive(previous))
      throw new Error(`ship is already running for ${root}`);
    if (previous && lockOwner(path) === previous) unlinkSync(path);
    symlinkSync(owner, path);
  }
  return () => {
    if (lockOwner(path) === owner) unlinkSync(path);
  };
}
