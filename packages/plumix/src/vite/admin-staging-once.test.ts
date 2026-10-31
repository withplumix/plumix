import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

import { plumix } from "./index.js";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-admin-once-")));
  // A resolved config written out, as `plumix()` returns it: evaluating the
  // real `plumix()` from source would cost the test half a minute.
  writeFileSync(
    join(dir, "plumix.config.mjs"),
    `const en = { code: "en", label: "English", direction: "ltr", enabled: true };
export default {
  runtime: { name: "x", handler: {}, generateEntry: () => "" },
  database: { kind: "x" },
  auth: { passkey: {} },
  theme: { templates: [] },
  plugins: [],
  i18n: { defaultLocale: en, locales: [en] },
};
`,
  );
  const adminDir = join(dir, "admin-dist");
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

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const stagedIndex = () => join(dir, "public/_plumix/admin/index.html");

function resolvedPlugin() {
  const plugin = plumix({
    configFile: join(dir, "plumix.config.mjs"),
    adminDir: join(dir, "admin-dist"),
  });
  (plugin.configResolved as (config: unknown) => void)({
    root: dir,
    publicDir: join(dir, "public"),
    command: "build",
  });
  return plugin;
}

const pluginContext = { warn: () => undefined };

test("an app build stages the admin before any environment builds", async () => {
  const plugin = resolvedPlugin();

  await (plugin.buildApp as (this: unknown) => Promise<void>).call(
    pluginContext,
  );

  expect(existsSync(stagedIndex())).toBe(true);
});

test("an environment build of an app build does not stage the admin again", async () => {
  const plugin = resolvedPlugin();
  await (plugin.buildApp as (this: unknown) => Promise<void>).call(
    pluginContext,
  );
  rmSync(stagedIndex());

  await (plugin.buildStart as (this: unknown) => Promise<void>).call(
    pluginContext,
  );

  expect(existsSync(stagedIndex())).toBe(false);
});
