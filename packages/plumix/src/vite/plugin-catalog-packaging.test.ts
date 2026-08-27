import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// `stagePluginCatalogs` (./index.ts) copies `<installed package>/<i18n.catalogPath>/
// <locale>.mjs` out of a consumer's `node_modules` at `plumix build` time, and throws
// `adminAssetNotFound` when the directory is missing or a declared locale has no
// `.mjs`. In this repo a plugin resolves to a symlinked source tree, so both are
// always in place; a site installing the same plugin from npm gets only what
// `package.json#files` allowlists, of whatever `i18n:compile` generated. A plugin
// that declares an `i18n` slot but leaves either behind therefore passes every check
// here and breaks the first `plumix build` a consumer runs.
//
// Scope: a textual scan for the `catalogPath:` literal, and only under `src/`.
// `catalogPath` is also a Lingui config key with an unrelated `<rootDir>/locales/
// {locale}` grammar (tooling/lingui/index.ts) — the scan stays out of the package
// root, where every `lingui.config.ts` lives, to keep the two vocabularies apart;
// widened there it would report `<rootDir>` as an unshipped directory. Plugins
// author the slot as a static string; a computed path would slip past.

const PLUGINS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../plugins",
);

const CATALOG_PATH = /\bcatalogPath:\s*"([^"]+)"/g;

// `files: ["dist"]` ships all of `dist/`, so `files` reaches a declared `./locales`
// exactly when it lists that first segment.
function rootSegment(path: string): string {
  return path.replace(/^\.\//, "").split("/")[0] ?? "";
}

function declaredCatalogPaths(srcDir: string): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .flatMap((entry) => [
      ...readFileSync(resolve(srcDir, entry), "utf8").matchAll(CATALOG_PATH),
    ])
    .map((match) => match[1])
    .filter((catalogPath) => catalogPath !== undefined);
}

const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = resolve(PLUGINS_DIR, entry.name);
    const pkg = JSON.parse(
      readFileSync(resolve(dir, "package.json"), "utf8"),
    ) as {
      name: string;
      files?: string[];
      scripts?: Record<string, string>;
    };
    return {
      name: pkg.name,
      catalogPaths: declaredCatalogPaths(resolve(dir, "src")),
      shipped: new Set((pkg.files ?? []).map(rootSegment)),
      compiles: pkg.scripts?.["i18n:compile"] !== undefined,
      hasSources: existsSync(resolve(dir, "locales")),
    };
  });

// Two filesystem signals the regex cannot fail alongside: a plugin that translates
// anything has `locales/*.po` checked in and an `i18n:compile` script for turbo's
// `build` edge to generate the `.mjs` from. Requiring all three to agree catches a
// slot whose catalogs nothing compiles, and keeps a silently drifting scan — a
// hoisted constant, a shared slot helper — from dropping plugins out of the guarded
// set while the suite stays green.
test("each plugin's i18n slot, catalog sources, and compile script agree", () => {
  const drifted = plugins
    .filter(({ catalogPaths, hasSources, compiles }) =>
      [hasSources, compiles].some(
        (signal) => signal !== catalogPaths.length > 0,
      ),
    )
    .map(
      ({ name, catalogPaths, hasSources, compiles }) =>
        `${name}: i18n slot=${catalogPaths.length > 0} locales/=${hasSources} i18n:compile=${compiles}`,
    );
  expect(
    drifted,
    `an i18n slot, a \`locales/\` directory, and an \`i18n:compile\` script come as a ` +
      `set. A slot without the script ships a directory with no compiled catalogs; ` +
      `sources without a slot mean this guard has stopped seeing the plugin.`,
  ).toEqual([]);
});

test("every declared i18n catalog directory is published", () => {
  const unshipped = plugins.flatMap(({ name, catalogPaths, shipped }) =>
    catalogPaths
      .filter((catalogPath) => !shipped.has(rootSegment(catalogPath)))
      .map(
        (catalogPath) => `${name} declares i18n.catalogPath "${catalogPath}"`,
      ),
  );
  expect(
    unshipped,
    `package.json#files does not reach these catalog directories, so the npm tarball ` +
      `ships no catalogs and every consumer's \`plumix build\` throws ` +
      `adminAssetNotFound. Add the directory to \`files\`.`,
  ).toEqual([]);
});
