import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger, ViteDevServer } from "vite";
import { createLogger, createServer } from "vite";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

import { plumix } from "./index.js";

/** The site sits beside a workspace plugin, as `apps/*` sit beside `packages/*`. */
let workspace: string;
let site: string;
let server: ViteDevServer | undefined;

/** A resolved config written out, as `plumix()` returns it. */
function writeConfig(plugin: Record<string, string>): void {
  writeFileSync(
    join(site, "plumix.config.ts"),
    `const en = { code: "en", label: "English", direction: "ltr", enabled: true };
export default {
  runtime: { name: "x", handler: {}, generateEntry: () => "" },
  database: { kind: "x" },
  auth: { passkey: {} },
  theme: { templates: [] },
  plugins: [{ id: "fixture", setup: () => undefined, ...${JSON.stringify(plugin)} }],
  i18n: { defaultLocale: en, locales: [en] },
};
`,
  );
}

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "plumix-admin-dev-")));
  site = join(workspace, "site");
  mkdirSync(site);
  writeConfig({ adminEntry: "./admin.js" });
  writeFileSync(join(site, "admin.js"), 'globalThis.marker = "before";\n');
  const adminDir = join(site, "admin-dist");
  mkdirSync(adminDir);
  writeFileSync(
    join(adminDir, "index.html"),
    `<!doctype html><script id="${MANIFEST_SCRIPT_ID}" type="application/json">{}</script>`,
  );
  writeFileSync(
    join(adminDir, "catalog-locales.json"),
    JSON.stringify({
      sourceLocale: "en",
      catalogs: { admin: ["en"], editor: ["en"], blocks: ["en"] },
    }),
  );
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(workspace, { recursive: true, force: true });
});

async function startServer(customLogger?: Logger): Promise<void> {
  server = await createServer({
    configFile: false,
    root: site,
    logLevel: "silent",
    customLogger,
    appType: "custom",
    server: { middlewareMode: true },
    plugins: [
      plumix({
        configFile: join(site, "plumix.config.ts"),
        adminDir: join(site, "admin-dist"),
      }),
    ],
  });
}

const stagedBundle = () =>
  readFileSync(
    join(site, ".plumix/public/_plumix/admin/plugins/site-bundle.js"),
    "utf8",
  );

const staged = (marker: string) =>
  vi.waitFor(() => expect(stagedBundle()).toContain(marker), {
    timeout: 5_000,
  });

test("a dev server restages the plugin admin bundle when its admin source changes", async () => {
  await startServer();
  await staged("before");

  writeFileSync(join(site, "admin.js"), 'globalThis.marker = "after";\n');

  await staged("after");
}, 20_000);

test("a dev server restages the bundle when a workspace plugin's admin source outside the root changes", async () => {
  const pluginDir = join(workspace, "plugin");
  mkdirSync(pluginDir);
  writeFileSync(join(pluginDir, "admin.js"), 'globalThis.marker = "before";\n');
  mkdirSync(join(site, "node_modules/@fixture"), { recursive: true });
  symlinkSync(pluginDir, join(site, "node_modules/@fixture/plugin"), "dir");
  writeConfig({ adminEntry: "./node_modules/@fixture/plugin/admin.js" });
  await startServer();
  await staged("before");

  writeFileSync(join(pluginDir, "admin.js"), 'globalThis.marker = "after";\n');

  await staged("after");
}, 20_000);

test("a dev server restages the bundle when the config names another admin entry", async () => {
  writeFileSync(join(site, "other.js"), 'globalThis.marker = "other";\n');
  await startServer();
  await staged("before");

  writeConfig({ adminEntry: "./other.js" });

  await staged("other");
}, 20_000);

test("a dev server warns about a plugin built against another admin", async () => {
  writeConfig({ adminEntry: "./admin.js", adminPeerVersion: "^99.0.0" });
  const warnings: string[] = [];
  const logger = createLogger("silent");
  logger.warn = (message) => {
    warnings.push(message);
  };

  await startServer(logger);
  await staged("before");

  expect(warnings).toEqual([
    expect.stringContaining('plugin "fixture" was built against @plumix/admin'),
  ]);
}, 20_000);
