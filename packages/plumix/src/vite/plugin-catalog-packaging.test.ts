import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { PLUGIN_I18N_SLOT } from "@plumix/core";

// Here plugins resolve to symlinked source; an npm install gets only what
// `files` allowlists. Scans only `src/`, avoiding Lingui's `catalogPath` key.

const PLUGINS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../plugins",
);

/**
 * Matching the body or the bare constant keeps a key reordering from being
 * drift.
 */
const I18N_SLOT = /\bi18n:\s*(\{[^}]*\}|PLUGIN_I18N_SLOT)/g;
const SLOT_LOCALES = /\blocales:\s*\[([^\]]*)\]/;
const SLOT_CATALOG_PATH = /\bcatalogPath:\s*"([^"]+)"/;
const QUOTED = /"([^"]+)"/g;

/**
 * `files: ["dist"]` ships all of `dist/`, so `files` reaches a declared
 * `./locales` exactly when it lists that first segment.
 */
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
    .map(([, body = ""]) =>
      body === "PLUGIN_I18N_SLOT"
        ? PLUGIN_I18N_SLOT
        : {
            locales: [
              ...(SLOT_LOCALES.exec(body)?.[1] ?? "").matchAll(QUOTED),
            ].map(([, locale = ""]) => locale),
            catalogPath: SLOT_CATALOG_PATH.exec(body)?.[1] ?? "",
          },
    );
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

// Requiring the slot, checked-in `.po` files and a compile script to agree
// keeps a drifting regex from silently dropping plugins out of the guard.
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

// A slot naming only the source locale projects no catalogs, so shipped
// translations go unstaged. Admin's glob bypasses the slot in this repo, so
// only npm installs would notice.
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
