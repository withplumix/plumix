import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { definePlugin } from "@plumix/core";

import {
  assemblePluginAdminBundle,
  resolveAndValidateEntry,
} from "./admin-plugin-bundle.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(resolve(tmpdir(), "plumix-assembler-"));
  await mkdir(resolve(workspace, "src"), { recursive: true });
  await writeFile(resolve(workspace, "src/admin.ts"), "// fixture");
});

afterEach(async () => {
  // Tests create a tiny tree under tmpdir; rely on OS cleanup.
});

const plugin = (entry: string) =>
  definePlugin("test", () => undefined, { adminEntry: entry });

describe("resolveAndValidateEntry", () => {
  test("resolves a relative path against the project root", async () => {
    const out = await resolveAndValidateEntry(
      plugin("./src/admin.ts") as Parameters<typeof resolveAndValidateEntry>[0],
      workspace,
    );
    expect(out).toBe(resolve(workspace, "src/admin.ts"));
  });

  test("accepts an absolute path inside the project root", async () => {
    const abs = resolve(workspace, "src/admin.ts");
    const out = await resolveAndValidateEntry(
      plugin(abs) as Parameters<typeof resolveAndValidateEntry>[0],
      workspace,
    );
    expect(out).toBe(abs);
  });

  test("rejects a relative path that escapes the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("../../etc/passwd") as Parameters<
          typeof resolveAndValidateEntry
        >[0],
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("rejects an absolute path outside the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("/etc/passwd") as Parameters<typeof resolveAndValidateEntry>[0],
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("throws a friendly error if the file doesn't exist", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("./src/nope.ts") as Parameters<
          typeof resolveAndValidateEntry
        >[0],
        workspace,
      ),
    ).rejects.toThrow(/file was not found/);
  });
});

describe("assemblePluginAdminBundle", () => {
  test("preserves side-effect imports even when the plugin package declares sideEffects: false", async () => {
    // Regression: a plugin's `dist/admin/index.js` runs `window.plumix.
    // registerPluginPage(...)` on module-eval. The synthesised entry is
    // a bare side-effect import. If the plugin's package.json declares
    // `"sideEffects": false`, esbuild treated the import as removable
    // and the bundle came out empty.
    const pkgDir = resolve(workspace, "node_modules/@fixture/plugin");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({
        name: "@fixture/plugin",
        version: "0.0.0",
        type: "module",
        sideEffects: false,
        main: "./entry.js",
      }),
    );
    await writeFile(
      resolve(pkgDir, "entry.js"),
      'globalThis.__plumix_admin_marker__ = "registered";\n',
    );

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    const result = await assemblePluginAdminBundle({
      plugins: [
        plugin("./node_modules/@fixture/plugin/entry.js") as Parameters<
          typeof assemblePluginAdminBundle
        >[0]["plugins"][number],
      ],
      adminDest,
      projectRoot: workspace,
    });

    expect(result).not.toBeNull();
    const bundlePath = resolve(adminDest, "plugins/site-bundle.js");
    const bundle = await readFile(bundlePath, "utf8");
    expect(bundle).toContain("__plumix_admin_marker__");
  });
});
