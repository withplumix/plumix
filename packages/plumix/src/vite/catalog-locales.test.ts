import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBuilder } from "vite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { loadConfigsFromSource } from "@plumix/vitest-config/source-loader";
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { plumix } from "./index.js";
import { serverEnvironment } from "./server-environment.js";

const CORE_SURFACES = ["blocks", "mail", "welcome", "admin-bar"] as const;

/**
 * A runtime whose entry is the projections the build generates, and nothing
 * else, on a site with one plugin that ships `en` and `de`.
 */
const config = (pluginLocales: string) => `import { auth } from "plumix/auth";
import { plumix } from "plumix";
import { definePlugin } from "plumix/plugin";

export default plumix({
  runtime: {
    name: "fixture",
    handler: {},
    generateEntry: () =>
      'export { default } from "virtual:plumix/catalog-locales";\\n' +
      'export { default as pluginCatalogs } from "virtual:plumix/plugin-catalogs";\\n',
  },
  database: { kind: "fixture" },
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  plugins: [
    definePlugin("vendor", {
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de"],
        catalogPath: ${JSON.stringify(pluginLocales)},
      },
      setup: () => undefined,
    }),
  ],
  i18n: { defaultLocale: "en", locales: ["en", "de-AT", "zh-SG", "fr"] },
});
`;

type PluginCatalogs = Record<
  string,
  readonly (() => Promise<{ messages: Record<string, string> }>)[]
>;

describe("virtual:plumix/catalog-locales in a build of a site enabling regional locales", () => {
  let dir: string;
  let adminDir: string;
  let undoSourceConfigs: () => void;
  let projection: Record<string, Record<string, string>>;
  let pluginCatalogs: PluginCatalogs;
  let warnings: unknown[];

  beforeAll(async () => {
    undoSourceConfigs = loadConfigsFromSource();
    // The admin shell as `@plumix/admin` builds it, down to the placeholder the
    // staging fills in and the locales its catalogs ship.
    adminDir = mkdtempSync(join(tmpdir(), "plumix-catalog-locales-admin-"));
    writeFileSync(
      join(adminDir, "index.html"),
      '<!doctype html><title>admin</title><body><script id="plumix-manifest" type="application/json">{}</script></body>',
    );
    writeFileSync(
      join(adminDir, "catalog-locales.json"),
      JSON.stringify({
        sourceLocale: "en",
        catalogs: { admin: ["en"], editor: ["en"], blocks: ["en"] },
      }),
    );
    dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-catalog-locales-")));
    const pluginLocales = join(dir, "vendor-locales");
    mkdirSync(pluginLocales);
    for (const locale of ["en", "de"]) {
      writeFileSync(
        join(pluginLocales, `${locale}.mjs`),
        `export const messages = ${JSON.stringify({ "vendor.hello": locale })};\n`,
      );
    }
    writeFileSync(join(dir, "plumix.config.ts"), config(pluginLocales));

    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      warnings.push(args);
    });
    const builder = await createBuilder({
      configFile: false,
      root: dir,
      logLevel: "warn",
      plugins: [plumixSourceResolver(), plumix({ adminDir })],
      environments: {
        server: serverEnvironment({
          entry: ".plumix/worker.ts",
          outDir: "dist/server",
        }),
      },
    });
    const environment = builder.environments.server;
    if (environment === undefined) throw new Error("no server environment");
    await builder.build(environment);
    vi.restoreAllMocks();
    const built = (await import(
      pathToFileURL(join(dir, "dist/server/worker.js")).href
    )) as {
      default: Record<string, Record<string, string>>;
      pluginCatalogs: PluginCatalogs;
    };
    projection = built.default;
    pluginCatalogs = built.pluginCatalogs;
  }, 120_000);

  afterAll(() => {
    undoSourceConfigs();
    rmSync(dir, { recursive: true, force: true });
    rmSync(adminDir, { recursive: true, force: true });
  });

  test.each(CORE_SURFACES)(
    "%s reads de-AT from de and zh-SG from zh-CN",
    (surface) => {
      expect(projection[surface]).toMatchObject({
        "de-AT": "de",
        "zh-SG": "zh-CN",
      });
    },
  );

  test.each(CORE_SURFACES)(
    "%s reads fr, which no catalog serves, from the source locale",
    (surface) => {
      expect(projection[surface]).toMatchObject({ fr: "en", en: "en" });
    },
  );

  test("the plugin catalogs module serves de-AT the plugin's de catalog", async () => {
    const loaders = pluginCatalogs["de-AT"] ?? [];
    const modules = await Promise.all(loaders.map((load) => load()));
    expect(modules.map((module) => module.messages)).toEqual([
      { "vendor.hello": "de" },
    ]);
  });

  test("an enabled locale with no catalog builds without a warning", () => {
    expect(warnings).toEqual([]);
  });
});
