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
// Scope: a textual scan for the `i18n` slot literal, and only under `src/`.
// `catalogPath` is also a Lingui config key with an unrelated `<rootDir>/locales/
// {locale}` grammar (tooling/lingui/index.ts) — the scan stays out of the package
// root, where every `lingui.config.ts` lives, to keep the two vocabularies apart;
// widened there it would report `<rootDir>` as an unshipped directory. Every test
// below reads one parse, so a slot the scan stops seeing — a computed value, a
// nested object splitting the body early — drops out of all three at once and the
// first one says so, rather than going quiet in the one that needed it.

const PLUGINS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../plugins",
);

// The slot is a flat object literal, so its body carries every key whatever order
// they are authored in — matching the body and reading keys out of it keeps a
// reordering from being drift the scan has to model.
const I18N_SLOT = /\bi18n:\s*\{([^}]*)\}/g;
const SLOT_LOCALES = /\blocales:\s*\[([^\]]*)\]/;
const SLOT_CATALOG_PATH = /\bcatalogPath:\s*"([^"]+)"/;
const QUOTED = /"([^"]+)"/g;

// `files: ["dist"]` ships all of `dist/`, so `files` reaches a declared `./locales`
// exactly when it lists that first segment.
function rootSegment(path: string): string {
  return path.replace(/^\.\//, "").split("/")[0] ?? "";
}

interface CatalogSlot {
  readonly locales: readonly string[];
  readonly catalogPath: string;
}

function declaredSlots(srcDir: string): CatalogSlot[] {
  return readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .flatMap((entry) => [
      ...readFileSync(resolve(srcDir, entry), "utf8").matchAll(I18N_SLOT),
    ])
    .map(([, body = ""]) => ({
      locales: [...(SLOT_LOCALES.exec(body)?.[1] ?? "").matchAll(QUOTED)].map(
        ([, locale = ""]) => locale,
      ),
      catalogPath: SLOT_CATALOG_PATH.exec(body)?.[1] ?? "",
    }));
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
      dir,
      slots: declaredSlots(resolve(dir, "src")),
      shipped: new Set((pkg.files ?? []).map(rootSegment)),
      compiles: pkg.scripts?.["i18n:compile"] !== undefined,
      hasSources: existsSync(resolve(dir, "locales")),
    };
  });

// Two filesystem signals the regex cannot fail alongside: a plugin that translates
// anything has `locales/*.po` checked in and an `i18n:compile` script for turbo's
// `build` edge to generate the `.mjs` from. Requiring all three to agree catches a
// slot whose catalogs nothing compiles, and keeps a silently drifting scan — a
// hoisted constant, a shared slot helper, a reordered key — from dropping plugins
// out of the guarded set while the suite stays green.
test("each plugin's i18n slot, catalog sources, and compile script agree", () => {
  const drifted = plugins
    .filter(({ slots, hasSources, compiles }) =>
      [hasSources, compiles].some((signal) => signal !== slots.length > 0),
    )
    .map(
      ({ name, slots, hasSources, compiles }) =>
        `${name}: i18n slot=${slots.length > 0} locales/=${hasSources} i18n:compile=${compiles}`,
    );
  expect(
    drifted,
    `an i18n slot, a \`locales/\` directory, and an \`i18n:compile\` script come as a ` +
      `set. A slot without the script ships a directory with no compiled catalogs; ` +
      `sources without a slot mean this guard has stopped seeing the plugin.`,
  ).toEqual([]);
});

test("every declared i18n catalog directory is published", () => {
  const unshipped = plugins.flatMap(({ name, slots, shipped }) =>
    slots
      .filter(({ catalogPath }) => !shipped.has(rootSegment(catalogPath)))
      .map(
        ({ catalogPath }) =>
          `${name} declares i18n.catalogPath "${catalogPath}"`,
      ),
  );
  expect(
    unshipped,
    `package.json#files does not reach these catalog directories, so the npm tarball ` +
      `ships no catalogs and every consumer's \`plumix build\` throws ` +
      `adminAssetNotFound. Add the directory to \`files\`.`,
  ).toEqual([]);
});

// `projectPluginI18n` (@plumix/core) walks the slot's `locales` and drops the source
// locale, so a slot naming only `en` projects an empty catalog map, `buildManifest`
// omits the plugin from `pluginI18n` entirely, and `stagePluginCatalogs` never copies
// a file — the shipped `.po` translations are unreachable. Nothing else catches this:
// admin bundles workspace plugins through a filesystem glob over `locales/*.mjs`
// (packages/admin/src/lib/catalog-globs.ts), so the declared set is bypassed in this
// repo and only bites a site that installs the plugin from npm. Declaring is safe —
// the slot's contract intersects with the site's enabled locales before any URL is
// emitted, so naming a locale the site hasn't enabled expands nothing.
test("each plugin declares exactly the locales it ships catalogs for", () => {
  const drifted = plugins.flatMap(({ name, dir, slots }) =>
    slots.flatMap(({ locales, catalogPath }) => {
      const catalogDir = resolve(dir, catalogPath);
      if (!existsSync(catalogDir)) return [];
      const shipped = readdirSync(catalogDir)
        .filter((entry) => entry.endsWith(".po"))
        .map((entry) => entry.replace(/\.po$/, ""))
        .sort();
      const declared = [...locales].sort();
      if (shipped.join() === declared.join()) return [];
      return [
        `${name} declares [${declared.join(", ")}] but ${catalogPath} ships [${shipped.join(", ")}]`,
      ];
    }),
  );
  expect(
    drifted,
    `a plugin's \`i18n.locales\` is the only thing that reaches its translations: ` +
      `a locale with a \`.po\` but no declaration is dead weight in the tarball, and ` +
      `a declaration with no \`.po\` fails a consumer's \`plumix build\` with ` +
      `adminAssetNotFound. Keep the two in step.`,
  ).toEqual([]);
});
