import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

import { plumix } from "./index.js";

let dir: string;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-admin-catalogs-")));
  // A resolved config written out, as `plumix()` returns it: evaluating the
  // real `plumix()` from source would cost the test half a minute.
  writeFileSync(
    join(dir, "plumix.config.mjs"),
    `const locale = (code, label) => ({ code, label, direction: "ltr", enabled: true });
export default {
  runtime: { name: "x", handler: {}, generateEntry: () => "" },
  database: { kind: "x" },
  auth: { passkey: {} },
  theme: { templates: [] },
  plugins: [],
  i18n: {
    defaultLocale: locale("en", "English"),
    locales: [locale("en", "English"), locale("zh-CN", "中文"), locale("de-AT", "Deutsch")],
  },
};
`,
  );
  // The admin as `@plumix/admin` builds it: the manifest placeholder and the
  // locales each of its catalog sets ships.
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
      catalogs: {
        admin: ["de", "en", "zh-CN"],
        editor: ["de", "en", "zh-CN"],
        blocks: ["en", "zh-CN"],
      },
    }),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function stagedManifest(): Record<string, unknown> {
  const html = readFileSync(
    join(dir, "public/_plumix/admin/index.html"),
    "utf8",
  );
  const json = new RegExp(
    `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>([\\s\\S]*?)</script>`,
  ).exec(html)?.[1];
  return JSON.parse(json ?? "{}") as Record<string, unknown>;
}

test("staging the admin injects each enabled locale's catalog locale for the admin, editor and blocks catalogs", async () => {
  const plugin = plumix({
    configFile: join(dir, "plumix.config.mjs"),
    adminDir: join(dir, "admin-dist"),
  });
  (plugin.configResolved as (config: unknown) => void)({
    root: dir,
    publicDir: join(dir, "public"),
    command: "build",
  });
  await (plugin.buildStart as (this: unknown) => Promise<void>).call({
    warn: () => undefined,
  });

  expect(stagedManifest().catalogLocales).toEqual({
    admin: { en: "en", "zh-CN": "zh-CN", "de-AT": "de" },
    editor: { en: "en", "zh-CN": "zh-CN", "de-AT": "de" },
    blocks: { en: "en", "zh-CN": "zh-CN", "de-AT": "en" },
  });
});
