import path from "node:path";
import { build } from "esbuild";
import { describe, expect, test } from "vitest";

import { environmentOf } from "../../../layers.js";

const SRC = path.resolve(import.meta.dirname, "../..");

/** The core modules a browser bundle of `plumix/auth/client` carries. */
async function bundledCoreModules(): Promise<readonly string[]> {
  const { metafile } = await build({
    entryPoints: [path.join(import.meta.dirname, "index.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return Object.keys(metafile.inputs)
    .map((input) => path.relative(SRC, path.resolve(input)))
    .filter((file) => !file.startsWith("..") && !file.includes("node_modules"))
    .map((file) => file.split(path.sep).join("/"));
}

describe("the plumix/auth/client browser bundle", () => {
  test("builds and carries no server-only module", async () => {
    const modules = await bundledCoreModules();

    expect(modules).toContain("auth/client/index.ts");
    expect(
      modules.filter((file) => environmentOf(file) !== "client-safe"),
    ).toEqual([]);
  });
});
