import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import { createPluginRegistry, definePlugin } from "@plumix/core";

import { assemblePluginAdminBundle } from "./admin-plugin-bundle.js";

// Imports `theme.css` from `@plumix/admin`'s built output, so it needs a real
// build.

type AssemblerPlugin = Parameters<
  typeof assemblePluginAdminBundle
>[0]["plugins"][number];

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(resolve(tmpdir(), "plumix-assembler-css-"));
});

const plugin = (entry: string) =>
  definePlugin("test", () => undefined, { adminEntry: entry });

describe("assemblePluginAdminBundle — Tailwind sidecar", () => {
  test("emits a Tailwind sidecar CSS for utility classes referenced by plugin source", async () => {
    // Plugin admin chunks live outside the admin's Tailwind scan, so their
    // utilities need the sidecar.
    const pkgDir = resolve(workspace, "node_modules/@fixture/plugin-css");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({
        name: "@fixture/plugin-css",
        version: "0.0.0",
        type: "module",
        main: "./entry.js",
      }),
    );
    await writeFile(
      resolve(pkgDir, "entry.js"),
      // Class strings live in compiled JSX as plain literals; the
      // scanner picks them up the same as TS/TSX source.
      'export const Marker = () => h("div", { className: "size-12 py-16 bg-card text-destructive border-dashed" });\n',
    );

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    const result = await assemblePluginAdminBundle({
      plugins: [
        plugin(
          "./node_modules/@fixture/plugin-css/entry.js",
        ) as AssemblerPlugin,
      ],
      registry: createPluginRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    // Both URLs must be absolute — relative `./plugins/...` would 404
    // when the SPA serves index.html for a deep-link like
    // `/_plumix/admin/pages/<plugin>` and the browser resolves the
    // src against the current URL.
    expect(result?.chunkUrl).toBe("/_plumix/admin/plugins/site-bundle.js");
    expect(result?.cssUrl).toBe("/_plumix/admin/plugins/site-bundle.css");
    const css = await readFile(
      resolve(adminDest, "plugins/site-bundle.css"),
      "utf8",
    );
    expect(css).toContain(".size-12");
    expect(css).toContain(".py-16");
    // Token-mapped utilities resolve to `var(--card)` / `var(--destructive)`
    // because the synthesised compile entry imports the shared theme.css.
    expect(css).toContain("var(--card)");
    expect(css).toContain("var(--destructive)");
    expect(css).toContain(".border-dashed");
    // In the shared `utilities` layer, a plugin's `.hidden` would load after
    // the admin CSS and collapse the admin sidebar.
    expect(css).toMatch(/@layer plumix-plugins\s*\{/);
    expect(css).not.toMatch(/@layer utilities\s*\{/);
  });

  test("compiles the theme's role utilities that plugin source references", async () => {
    // The shared theme.css names the layout roles plugins reach for instead of
    // arbitrary values; the sidecar only has them if it compiles that file.
    const pkgDir = resolve(workspace, "node_modules/@fixture/plugin-roles");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({
        name: "@fixture/plugin-roles",
        version: "0.0.0",
        type: "module",
        main: "./entry.js",
      }),
    );
    await writeFile(
      resolve(pkgDir, "entry.js"),
      'export const Marker = () => h("div", { className: "max-h-dialog max-h-sticky-panel grid-cols-media grid-cols-label-value aspect-og-card transition-width" });\n',
    );

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    await assemblePluginAdminBundle({
      plugins: [
        plugin(
          "./node_modules/@fixture/plugin-roles/entry.js",
        ) as AssemblerPlugin,
      ],
      registry: createPluginRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    const css = await readFile(
      resolve(adminDest, "plugins/site-bundle.css"),
      "utf8",
    );
    expect(css).toMatch(/\.max-h-dialog\{max-height:85vh\}/);
    expect(css).toMatch(
      /\.max-h-sticky-panel\{max-height:calc\(100vh - 4rem\)\}/,
    );
    expect(css).toMatch(
      /\.grid-cols-media\{grid-template-columns:repeat\(auto-fill,minmax\(10rem,1fr\)\)\}/,
    );
    expect(css).toMatch(
      /\.grid-cols-label-value\{grid-template-columns:auto 1fr\}/,
    );
    expect(css).toMatch(/\.aspect-og-card\{aspect-ratio:40\/21\}/);
    expect(css).toMatch(/\.transition-width\{[^}]*transition-property:width/);
  });
});
