import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const exampleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(exampleDir, "dist");
const plumixDir = resolve(exampleDir, ".plumix");
const workerArtifact = resolve(distDir, "plumix_minimal/index.js");
const workerWrangler = resolve(distDir, "plumix_minimal/wrangler.json");
const adminIndexHtml = resolve(distDir, "client/_plumix/admin/index.html");

async function runBuild(): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("pnpm", ["exec", "plumix", "build"], {
      cwd: exampleDir,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stderr }));
  });
}

describe("examples/minimal — plumix build", () => {
  test(
    "emits a worker bundle, rendered wrangler.json, and staged admin assets",
    async () => {
      rmSync(distDir, { recursive: true, force: true });
      rmSync(plumixDir, { recursive: true, force: true });

      const { code, stderr } = await runBuild();
      expect(code, `plumix build failed:\n${stderr}`).toBe(0);

      expect(existsSync(workerArtifact)).toBe(true);
      expect(statSync(workerArtifact).size).toBeGreaterThan(1024);

      expect(existsSync(workerWrangler)).toBe(true);

      // Admin SPA ends up in the Cloudflare assets bundle.
      expect(existsSync(adminIndexHtml)).toBe(true);

      // Manifest placeholder is replaced by the vite plugin with a
      // config-derived payload. `examples/minimal` registers no plugins,
      // so postTypes is empty but the tag must still be present.
      const adminHtml = readFileSync(adminIndexHtml, "utf8");
      expect(adminHtml).toMatch(
        /<script id="plumix-manifest" type="application\/json">\{"postTypes":\[\],"taxonomies":\[\],"metaBoxes":\[\]\}<\/script>/,
      );
    },
    60_000,
  );
});
