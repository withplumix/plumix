import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import {
  createPluginRegistry,
  definePlugin,
  HookRegistry,
  installPlugins,
} from "@plumix/core";

import {
  assemblePluginAdminBundle,
  resolveAndValidateEntry,
} from "./admin-plugin-bundle.js";

// Re-derive the assembler's plugin-list element type so call sites can
// cast without repeating `Parameters<...>[0]["plugins"][number]`.
type AssemblerPlugin = Parameters<
  typeof assemblePluginAdminBundle
>[0]["plugins"][number];

type ResolveEntryPlugin = Parameters<typeof resolveAndValidateEntry>[0];

// Empty registry stand-in for tests that don't exercise auto-register
// — the assembler still emits namespace imports and runs Tailwind, which
// is all we're asserting on. Using `createPluginRegistry()` keeps the
// shape honest (mutable registry the assembler reads as readonly).
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

  // The Tailwind-sidecar case compiles CSS against `@plumix/admin`'s built
  // `theme.css`, so it needs a build and lives in
  // `admin-plugin-bundle.build.test.ts` (run by `test:build`).

  test("auto-emits register* calls for ctx-registered admin pages and field types", async () => {
    // Plugin authors used to write a `window.plumix.registerPluginPage`
    // call inside their admin chunk in addition to `ctx.registerAdmin
    // Page({ component: { package, export } })`. The bundler now
    // namespace-imports each plugin's adminEntry and emits the matching
    // register call from the registry — verifying both the admin page
    // and the field-type variant here so the surfaces stay in lockstep.
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
          type: "media_picker",
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
    expect(bundle).toContain('"media_picker"');
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
