import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createPluginRegistry,
  defineAuthMethod,
  definePlugin,
  HookRegistry,
  installPlugins,
} from "@plumix/core";

import {
  assemblePluginAdminBundle,
  resolveAndValidateEntry,
} from "./admin-plugin-bundle.js";

/**
 * Re-derive the assembler's plugin-list element type so call sites can
 * cast without repeating `Parameters<...>[0]["plugins"][number]`.
 */
type AssemblerPlugin = Parameters<
  typeof assemblePluginAdminBundle
>[0]["plugins"][number];

type ResolveEntryPlugin = Parameters<typeof resolveAndValidateEntry>[0];

function emptyRegistry() {
  return createPluginRegistry();
}

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(resolve(tmpdir(), "plumix-assembler-"));
  await mkdir(resolve(workspace, "src"), { recursive: true });
  await writeFile(resolve(workspace, "src/admin.ts"), "// fixture");
});

const plugin = (entry: string) =>
  definePlugin("test", () => undefined, { adminEntry: entry });

describe("resolveAndValidateEntry", () => {
  test("resolves a relative path against the project root", async () => {
    const out = await resolveAndValidateEntry(
      plugin("./src/admin.ts") as ResolveEntryPlugin,
      workspace,
    );
    expect(out).toBe(resolve(workspace, "src/admin.ts"));
  });

  test("accepts an absolute path inside the project root", async () => {
    const abs = resolve(workspace, "src/admin.ts");
    const out = await resolveAndValidateEntry(
      plugin(abs) as ResolveEntryPlugin,
      workspace,
    );
    expect(out).toBe(abs);
  });

  test("rejects a relative path that escapes the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("../../etc/passwd") as ResolveEntryPlugin,
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("rejects an absolute path outside the project root", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("/etc/passwd") as ResolveEntryPlugin,
        workspace,
      ),
    ).rejects.toThrow(/outside the project root/);
  });

  test("throws a friendly error if the file doesn't exist", async () => {
    await expect(
      resolveAndValidateEntry(
        plugin("./src/nope.ts") as ResolveEntryPlugin,
        workspace,
      ),
    ).rejects.toThrow(/file was not found/);
  });
});

describe("assemblePluginAdminBundle", () => {
  test("preserves side-effect imports even when the plugin package declares sideEffects: false", async () => {
    // With `"sideEffects": false`, esbuild treated the bare side-effect import
    // as removable and the bundle came out empty.
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
        plugin("./node_modules/@fixture/plugin/entry.js") as AssemblerPlugin,
      ],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    expect(result).not.toBeNull();
    const bundlePath = resolve(adminDest, "plugins/site-bundle.js");
    const bundle = await readFile(bundlePath, "utf8");
    expect(bundle).toContain("__plumix_admin_marker__");
  });

  test("registers config block modules into the admin (no adminEntry needed)", async () => {
    const adminDest = resolve(workspace, "admin-dest");
    await mkdir(adminDest, { recursive: true });
    await writeFile(
      resolve(workspace, "src/blocks.ts"),
      'export default [{ name: "acme/widget", render: () => null }];',
    );

    const result = await assemblePluginAdminBundle({
      plugins: [], // no adminEntry plugins — the bundle still builds for blocks
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
      blockModules: [
        { module: resolve(workspace, "src/blocks.ts"), exportName: "default" },
      ],
    });

    expect(result).not.toBeNull();
    const bundle = await readFile(
      resolve(adminDest, "plugins/site-bundle.js"),
      "utf8",
    );
    expect(bundle).toContain("registerPluginBlock");
    expect(bundle).toContain("acme/widget");
  });

  test("builds for a site whose only admin contribution is a method client, registered through the host's auth-client shim", async () => {
    const adminDest = resolve(workspace, "admin-dest");
    await mkdir(adminDest, { recursive: true });
    const client = resolve(workspace, "src/fixture-client.ts");
    await writeFile(
      client,
      'import { defineAuthMethodClient } from "plumix/auth/client";\n' +
        'export default defineAuthMethodClient("fixture", () => ({}));\n',
    );
    const withClient = definePlugin("fixture", {
      setup: () => undefined,
      authMethods: [
        defineAuthMethod({
          name: "fixture",
          label: "Fixture",
          routes: {},
          client,
        }),
      ],
    });

    const result = await assemblePluginAdminBundle({
      plugins: [withClient as AssemblerPlugin],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    expect(result).not.toBeNull();
    // The host's `window.plumix.runtime`, which the shim reads.
    const registered: unknown[] = [];
    vi.stubGlobal("plumix", {
      runtime: {
        authClient: {
          defineAuthMethodClient: (name: string) => ({ name }),
          registerAuthMethodClients: (clients: readonly unknown[]) => {
            registered.push(...clients);
          },
        },
      },
    });
    try {
      await import(
        /* @vite-ignore */ pathToFileURL(
          resolve(adminDest, "plugins/site-bundle.js"),
        ).href
      );
    } finally {
      vi.unstubAllGlobals();
    }
    expect(registered).toEqual([{ name: "fixture" }]);
  });

  test("auto-emits register* calls for ctx-registered admin pages and field types", async () => {
    const pkgDir = resolve(workspace, "node_modules/@fixture/plugin-auto");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({
        name: "@fixture/plugin-auto",
        version: "0.0.0",
        type: "module",
        main: "./entry.js",
      }),
    );
    await writeFile(
      resolve(pkgDir, "entry.js"),
      `
        export const MediaLibrary = () => null;
        export const MediaPicker = () => null;
      `,
    );

    const descriptor = definePlugin(
      "auto",
      (ctx) => {
        ctx.registerAdminPage({
          path: "/auto",
          title: "Auto",
          component: "MediaLibrary",
        });
        ctx.registerFieldType({
          type: "mediaPicker",
          component: "MediaPicker",
        });
      },
      { adminEntry: "./node_modules/@fixture/plugin-auto/entry.js" },
    );

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [descriptor],
    });

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    const result = await assemblePluginAdminBundle({
      plugins: [descriptor as AssemblerPlugin],
      registry,
      adminDest,
      projectRoot: workspace,
    });

    expect(result).not.toBeNull();
    const bundle = await readFile(
      resolve(adminDest, "plugins/site-bundle.js"),
      "utf8",
    );
    // Minified output preserves the registration verbs as method names
    // and the path / type strings as literals.
    expect(bundle).toContain("registerPluginPage");
    expect(bundle).toContain('"/auto"');
    expect(bundle).toContain("registerPluginFieldType");
    expect(bundle).toContain('"mediaPicker"');
  });

  test("auto-emits register* calls for plugin mark adminSchema refs", async () => {
    const pkgDir = resolve(workspace, "node_modules/@fixture/plugin-blocks");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({
        name: "@fixture/plugin-blocks",
        version: "0.0.0",
        type: "module",
        main: "./entry.js",
      }),
    );
    await writeFile(
      resolve(pkgDir, "entry.js"),
      `
        export const calloutSchema = { name: "acme/callout" };
        export const CalloutEditor = () => null;
        export const warningHighlightSchema = { name: "acme/highlight-warning" };
      `,
    );

    const descriptor = definePlugin(
      "acme",
      (ctx) => {
        ctx.registerMark({
          name: "acme/highlight-warning",
          title: "Warning highlight",
          adminSchema: "warningHighlightSchema",
        });
      },
      { adminEntry: "./node_modules/@fixture/plugin-blocks/entry.js" },
    );

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [descriptor],
    });

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    const result = await assemblePluginAdminBundle({
      plugins: [descriptor as AssemblerPlugin],
      registry,
      adminDest,
      projectRoot: workspace,
    });

    expect(result).not.toBeNull();
    const bundle = await readFile(
      resolve(adminDest, "plugins/site-bundle.js"),
      "utf8",
    );
    expect(bundle).toContain("registerPluginMarkSchema");
    expect(bundle).toContain('"acme/highlight-warning"');
  });
});

/** The stylesheet `@plumix/admin`'s build copies to `dist/theme.css`. */
const ADMIN_SOURCE_THEME_CSS = fileURLToPath(
  new URL("../../../admin/src/styles/theme.css", import.meta.url),
);

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
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
      themeCssPath: ADMIN_SOURCE_THEME_CSS,
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
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
      themeCssPath: ADMIN_SOURCE_THEME_CSS,
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
