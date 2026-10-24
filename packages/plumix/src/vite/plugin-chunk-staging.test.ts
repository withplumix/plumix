import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { AnyPluginDescriptor } from "@plumix/core";

import { stagePluginChunks } from "./plugin-chunk-staging.js";

async function project(): Promise<{ root: string; adminDest: string }> {
  const root = await mkdtemp(join(tmpdir(), "plumix-chunk-staging-"));
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist/admin.js"), "export const js = 1;");
  await writeFile(join(root, "dist/admin.css"), ".x{color:red}");
  return { root, adminDest: join(root, "staged") };
}

describe("stagePluginChunks", () => {
  test("each returned file name is a file staged under plugins/", async () => {
    const { root, adminDest } = await project();
    const plugin = {
      id: "hello",
      adminChunk: "./dist/admin.js",
      adminCss: "./dist/admin.css",
    } as unknown as AnyPluginDescriptor;

    const [ref] = await stagePluginChunks(adminDest, [plugin], root);

    expect(ref?.pluginId).toBe("hello");
    expect(
      await readFile(join(adminDest, "plugins", ref?.chunkFile ?? ""), "utf8"),
    ).toBe("export const js = 1;");
    expect(
      await readFile(join(adminDest, "plugins", ref?.cssFile ?? ""), "utf8"),
    ).toBe(".x{color:red}");
  });

  test("a plugin without a stylesheet has no css file", async () => {
    const { root, adminDest } = await project();
    const plugin = {
      id: "hello",
      adminChunk: "./dist/admin.js",
    } as unknown as AnyPluginDescriptor;

    const [ref] = await stagePluginChunks(adminDest, [plugin], root);

    expect(ref?.cssFile).toBeUndefined();
  });
});
