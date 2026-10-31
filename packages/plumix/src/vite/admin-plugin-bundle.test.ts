import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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

type Registration = readonly [verb: string, ...args: unknown[]];

/** Runs the bundle against a host `window.plumix` that records each call. */
async function registrationsOf(adminDest: string): Promise<Registration[]> {
  const calls: Registration[] = [];
  const host = new Proxy(
    {},
    {
      get:
        (_target, verb) =>
        (...args: unknown[]) => {
          calls.push([String(verb), ...args]);
        },
    },
  );
  vi.stubGlobal("window", { plumix: host });
  try {
    await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(adminDest, "plugins/site-bundle.js"),
      ).href
    );
  } finally {
    vi.unstubAllGlobals();
  }
  return calls;
}

/** A component the bundle passes on, matched by the name `keepNames` keeps. */
const component = (name: string): unknown => expect.objectContaining({ name });

beforeEach(async () => {
  workspace = await mkdtemp(resolve(tmpdir(), "plumix-assembler-"));
  await mkdir(resolve(workspace, "src"), { recursive: true });
  await writeFile(resolve(workspace, "src/admin.ts"), "// fixture");
});

const plugin = (entry: string) =>
  definePlugin("test", { setup: () => undefined, adminEntry: entry });

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
    // With `"sideEffects": false`, the bundler treated the bare side-effect import
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

  test("builds from a `use client` module without printing a warning", async () => {
    // A site's `plumix build` prints whatever this build does.
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      '"use client";\nglobalThis.__client__ = true;\n',
    );
    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");

    try {
      await assemblePluginAdminBundle({
        plugins: [plugin("./src/admin.ts") as AssemblerPlugin],
        registry: emptyRegistry(),
        adminDest: resolve(workspace, "dist"),
        projectRoot: workspace,
      });

      expect(warn).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  test("keeps a bundled dependency's licence comment (ADR 0043)", async () => {
    const pkgDir = resolve(workspace, "node_modules/@fixture/licensed");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      resolve(pkgDir, "package.json"),
      JSON.stringify({ name: "@fixture/licensed", type: "module" }),
    );
    await writeFile(
      resolve(pkgDir, "index.js"),
      "/*! @license Fixture v1 | MIT */\nexport const licensed = () => 1;\n",
    );
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      'import { licensed } from "@fixture/licensed";\nglobalThis.__licensed__ = licensed;\n',
    );

    const adminDest = resolve(workspace, "dist");
    await assemblePluginAdminBundle({
      plugins: [plugin("./src/admin.ts") as AssemblerPlugin],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    expect(
      await readFile(resolve(adminDest, "plugins/site-bundle.js"), "utf8"),
    ).toContain("@license Fixture v1 | MIT");
  });

  test("puts lazily imported plugin code in the one file the admin loads", async () => {
    // A split chunk would load from the site root, not from beside the bundle.
    await writeFile(
      resolve(workspace, "src/lazy.ts"),
      'export const lazy = "__lazy_chunk__";\n',
    );
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      'globalThis.__lazy__ = () => import("./lazy.js");\n',
    );

    const adminDest = resolve(workspace, "dist");
    await assemblePluginAdminBundle({
      plugins: [plugin("./src/admin.ts") as AssemblerPlugin],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    const scripts = (await readdir(resolve(adminDest, "plugins"))).filter(
      (file) => file.endsWith(".js"),
    );
    expect(scripts).toEqual(["site-bundle.js"]);
    expect(
      await readFile(resolve(adminDest, "plugins/site-bundle.js"), "utf8"),
    ).toContain("__lazy_chunk__");
  });

  test("leaves the plugin files already staged beside the bundle", async () => {
    const adminDest = resolve(workspace, "dist");
    const catalog = resolve(adminDest, "plugins/media/locales/en.mjs");
    await mkdir(dirname(catalog), { recursive: true });
    await writeFile(catalog, "export const messages = {};\n");

    await assemblePluginAdminBundle({
      plugins: [plugin("./src/admin.ts") as AssemblerPlugin],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    expect(await readFile(catalog, "utf8")).toBe(
      "export const messages = {};\n",
    );
  });

  test("drops the unused modules of a dependency that declares sideEffects: false", async () => {
    // An icon library's barrel: each icon is a call, so only the package's
    // `sideEffects: false` lets the unused ones go.
    const iconsDir = resolve(workspace, "node_modules/@fixture/icons");
    await mkdir(iconsDir, { recursive: true });
    await writeFile(
      resolve(iconsDir, "package.json"),
      JSON.stringify({
        name: "@fixture/icons",
        version: "0.0.0",
        type: "module",
        sideEffects: false,
        main: "./index.js",
      }),
    );
    await writeFile(
      resolve(iconsDir, "index.js"),
      'export { used } from "./used.js";\nexport { unused } from "./unused.js";\n',
    );
    await writeFile(
      resolve(iconsDir, "make.js"),
      "export const make = (name) => ({ name });\n",
    );
    await writeFile(
      resolve(iconsDir, "used.js"),
      'import { make } from "./make.js";\nexport const used = make("__used_icon__");\n',
    );
    await writeFile(
      resolve(iconsDir, "unused.js"),
      'import { make } from "./make.js";\nexport const unused = make("__unused_icon__");\n',
    );
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      'import { used } from "@fixture/icons";\nglobalThis.__icon__ = used;\n',
    );

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });
    await assemblePluginAdminBundle({
      plugins: [plugin("./src/admin.ts") as AssemblerPlugin],
      registry: emptyRegistry(),
      adminDest,
      projectRoot: workspace,
    });

    const bundle = await readFile(
      resolve(adminDest, "plugins/site-bundle.js"),
      "utf8",
    );
    expect(bundle).toContain("__used_icon__");
    expect(bundle).not.toContain("__unused_icon__");
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

    const descriptor = definePlugin("auto", {
      setup: (ctx) => {
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
      adminEntry: "./node_modules/@fixture/plugin-auto/entry.js",
    });

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
    expect(await registrationsOf(adminDest)).toEqual([
      ["registerPluginPage", "/auto", component("MediaLibrary")],
      ["registerPluginFieldType", "mediaPicker", component("MediaPicker")],
    ]);
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

    const descriptor = definePlugin("acme", {
      setup: (ctx) => {
        ctx.registerMark({
          name: "acme/highlight-warning",
          title: "Warning highlight",
          adminSchema: "warningHighlightSchema",
        });
      },
      adminEntry: "./node_modules/@fixture/plugin-blocks/entry.js",
    });

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
    expect(await registrationsOf(adminDest)).toEqual([
      [
        "registerPluginMarkSchema",
        "acme/highlight-warning",
        { name: "acme/highlight-warning" },
      ],
    ]);
  });

  test("auto-emits a register call for a plugin's declared dashboard widget", async () => {
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      "export const Widget = () => null;",
    );
    const descriptor = definePlugin("acme", {
      setup: (ctx) => {
        ctx.registerDashboardWidget({
          id: "acme:stats",
          title: "Stats",
          component: "Widget",
        });
      },
      adminEntry: "./src/admin.ts",
    });

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [descriptor],
    });

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    await assemblePluginAdminBundle({
      plugins: [descriptor as AssemblerPlugin],
      registry,
      adminDest,
      projectRoot: workspace,
    });

    expect(await registrationsOf(adminDest)).toEqual([
      ["registerPluginDashboardWidget", "acme:stats", component("Widget")],
    ]);
  });

  test("emits a dashboard widget only against the plugin that registered it", async () => {
    await writeFile(
      resolve(workspace, "src/admin.ts"),
      "export const Widget = () => null;",
    );
    await writeFile(
      resolve(workspace, "src/other-admin.ts"),
      "export const OtherWidget = () => 0;",
    );
    const acme = definePlugin("acme", {
      setup: (ctx) => {
        ctx.registerDashboardWidget({
          id: "acme:stats",
          title: "Stats",
          component: "Widget",
        });
      },
      adminEntry: "./src/admin.ts",
    });
    const other = definePlugin("other", {
      setup: (ctx) => {
        ctx.registerDashboardWidget({
          id: "other:stats",
          title: "Other stats",
          component: "OtherWidget",
        });
      },
      adminEntry: "./src/other-admin.ts",
    });

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [acme, other],
    });

    const adminDest = resolve(workspace, "dist");
    await mkdir(adminDest, { recursive: true });

    await assemblePluginAdminBundle({
      plugins: [acme, other] as AssemblerPlugin[],
      registry,
      adminDest,
      projectRoot: workspace,
    });

    expect(await registrationsOf(adminDest)).toEqual([
      ["registerPluginDashboardWidget", "acme:stats", component("Widget")],
      [
        "registerPluginDashboardWidget",
        "other:stats",
        component("OtherWidget"),
      ],
    ]);
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

    expect(result?.chunkFile).toBe("site-bundle.js");
    expect(result?.cssFile).toBe("site-bundle.css");
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
