import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { swapIntoPlace } from "./swap-into-place.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "plumix-swap-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const stagedCopy = async (name: string, marker: string): Promise<string> => {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), marker);
  return dir;
};

describe("swapIntoPlace", () => {
  test("replaces the destination with the staged copy and leaves nothing behind", async () => {
    const dest = await stagedCopy("admin", "old");
    await writeFile(join(dest, "stale.js"), "gone");
    const staged = await stagedCopy("staging", "new");

    await swapIntoPlace(staged, dest);

    expect(await readFile(join(dest, "index.html"), "utf8")).toBe("new");
    expect(existsSync(join(dest, "stale.js"))).toBe(false);
    expect(await readdir(root)).toEqual(["admin"]);
  });

  test("places the staged copy when nothing is there yet", async () => {
    const staged = await stagedCopy("staging", "first");
    const dest = join(root, "admin");

    await swapIntoPlace(staged, dest);

    expect(await readFile(join(dest, "index.html"), "utf8")).toBe("first");
  });

  test("stagers swapping at once all succeed and leave one complete copy", async () => {
    const dest = await stagedCopy("admin", "seed");

    await Promise.all(
      Array.from({ length: 200 }, async (_, i) =>
        swapIntoPlace(await stagedCopy(`staging-${i}`, `copy-${i}`), dest),
      ),
    );

    expect(await readFile(join(dest, "index.html"), "utf8")).toMatch(/^copy-/);
    expect(await readdir(root)).toEqual(["admin"]);
  });
});
