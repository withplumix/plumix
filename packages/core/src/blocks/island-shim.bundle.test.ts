import path from "node:path";
import { build } from "esbuild";
import { describe, expect, test } from "vitest";

async function bundledModules(): Promise<readonly string[]> {
  const { metafile } = await build({
    entryPoints: [path.join(import.meta.dirname, "island-shim.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return Object.keys(metafile.inputs).map((input) =>
    input.split(path.sep).join("/"),
  );
}

describe("the island shim's browser bundle", () => {
  // Every island chunk imports the shim, so server React here ships to the
  // client.
  test("carries no react-dom/server", async () => {
    const modules = await bundledModules();

    expect(modules.some((file) => file.endsWith("blocks/island-shim.ts"))).toBe(
      true,
    );
    expect(modules.filter((file) => file.includes("react-dom/"))).toEqual([]);
  });
});
