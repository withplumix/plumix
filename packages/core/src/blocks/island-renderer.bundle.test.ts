import path from "node:path";
import { build } from "esbuild";
import { describe, expect, test } from "vitest";

async function productionBundle(): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [path.join(import.meta.dirname, "island-renderer.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    minify: true,
    write: false,
    logLevel: "silent",
    // React reads `innerHTML` itself; only Plumix's own code is under test.
    external: ["react", "react-dom", "react-dom/*", "react/*"],
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.PLUMIX_DEV": '""',
    },
  });
  return outputFiles.map((file) => file.text).join("");
}

describe("the island renderer's production bundle", () => {
  test("carries none of the dev mismatch reporting", async () => {
    const code = await productionBundle();

    expect(code).not.toContain("plumix:island-hydration-mismatch");
    expect(code).not.toContain("innerHTML");
  });
});
