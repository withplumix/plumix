import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import { createPluginRegistry, definePlugin } from "@plumix/core";

import { assemblePluginAdminBundle } from "./admin-plugin-bundle.js";

// A build test (`*.build.test.ts`, run by `test:build`): it compiles Tailwind
// over plugin source and imports the shared `theme.css` from `@plumix/admin`'s
// built output, so it needs a real build — unlike the assembler's other cases,
// which are pure and live in `admin-plugin-bundle.test.ts`.

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
    // Regression: plugin admin chunks live outside the admin's Vite/
    // Tailwind scan, so unusual utility classes (`size-12`, `py-16`,
    // `bg-card`) silently produced no CSS. The assembler now compiles
    // Tailwind v4 over each plugin's source dir into a sibling
    // site-bundle.css; verify the load-bearing classes used by the
    // built-in media plugin land in the sidecar.
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
    // Utilities must land in the dedicated `plumix-plugins` cascade layer
    // (the admin's globals.css orders it lowest), NOT the shared `utilities`
    // layer. Otherwise a plugin re-emitting a base utility like `.hidden`
    // loads after the admin CSS and overrides its own responsive utilities —
    // the cascade collision that collapsed the admin sidebar.
    expect(css).toMatch(/@layer plumix-plugins\s*\{/);
    expect(css).not.toMatch(/@layer utilities\s*\{/);
  });
});
