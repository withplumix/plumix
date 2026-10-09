import { watch } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { stageIntoPlace } from "./stage-into-place.js";

let root: string;
let publicDir: string;
let stagingRoot: string;
let dest: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "plumix-stage-"));
  publicDir = join(root, "public");
  stagingRoot = join(root, "staging");
  dest = join(publicDir, "admin");
  await mkdir(publicDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const writeAdmin =
  (html: string) =>
  async (dir: string): Promise<void> => {
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeFile(join(dir, "index.html"), html);
    await writeFile(join(dir, "assets", "app.js"), "app");
  };

/** Each file under `dir`, by relative path, with its content. */
async function readTree(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const contents = await Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(dir, path), await readFile(path, "utf8")] as const;
    }),
  );
  return Object.fromEntries(contents);
}

describe("stageIntoPlace", () => {
  test("leaves the destination untouched when the restage builds the same files", async () => {
    await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v1") });
    const before = await stat(dest);

    await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v1") });

    expect((await stat(dest)).ino).toBe(before.ino);
  });

  test.each([
    {
      change: "a file changed",
      populate: writeAdmin("v2"),
      expected: { "index.html": "v2", "assets/app.js": "app" },
    },
    {
      change: "a file added",
      populate: async (dir: string) => {
        await writeAdmin("v1")(dir);
        await writeFile(join(dir, "assets", "chunk.js"), "chunk");
      },
      expected: {
        "index.html": "v1",
        "assets/app.js": "app",
        "assets/chunk.js": "chunk",
      },
    },
    {
      change: "a file removed",
      populate: async (dir: string) => {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "index.html"), "v1");
      },
      expected: { "index.html": "v1" },
    },
  ])(
    "replaces the destination when $change",
    async ({ populate, expected }) => {
      await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v1") });

      await stageIntoPlace({ stagingRoot, dest, populate });

      expect(await readTree(dest)).toEqual(expected);
    },
  );

  test("places the copy when the destination is missing", async () => {
    await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v1") });

    expect(await readFile(join(dest, "index.html"), "utf8")).toBe("v1");
  });

  test("creates the destination's parent when it is missing", async () => {
    const nested = join(publicDir, "_plumix", "admin");

    await stageIntoPlace({
      stagingRoot,
      dest: nested,
      populate: writeAdmin("v1"),
    });

    expect(await readFile(join(nested, "index.html"), "utf8")).toBe("v1");
  });

  test("touches nothing beside the destination and leaves no staging behind", async () => {
    await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v1") });
    const touched: string[] = [];
    const watcher = watch(publicDir, { recursive: true }, (_event, name) => {
      if (name !== null) touched.push(name);
    });

    try {
      await stageIntoPlace({ stagingRoot, dest, populate: writeAdmin("v2") });
      // fs.watch delivers events asynchronously; give them time to arrive.
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      watcher.close();
    }

    const outsideDest = touched.filter(
      (name) => name !== "admin" && !name.startsWith(`admin${sep}`),
    );
    expect(outsideDest).toEqual([]);
    expect(await readdir(publicDir)).toEqual(["admin"]);
    expect(await readdir(stagingRoot)).toEqual([]);
  });
});
