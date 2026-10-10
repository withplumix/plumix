import { describe, expect, test } from "vitest";

import { generatePluginCatalogsSource } from "./plugin-catalogs-codegen.js";

describe("generatePluginCatalogsSource", () => {
  test("no catalogs yields an empty locale map", () => {
    expect(generatePluginCatalogsSource(new Map())).toContain(
      "export default {};",
    );
  });

  test("lazy-imports every translated catalog under its locale, escaped", () => {
    const source = generatePluginCatalogsSource(
      new Map([
        [
          "de",
          [
            { path: "/site/a/locales/de.mjs", source: false },
            { path: '/site/b "q"/de.mjs', source: false },
          ],
        ],
        ["uk", [{ path: "/site/a/locales/uk.mjs", source: false }]],
      ]),
    );
    expect(source).toContain(
      '"de": [() => import("/site/a/locales/de.mjs"), () => import("/site/b \\"q\\"/de.mjs")],',
    );
    expect(source).toContain('"uk": [() => import("/site/a/locales/uk.mjs")],');
  });

  // A lazy import of a module the graph already holds statically makes
  // rolldown report INEFFECTIVE_DYNAMIC_IMPORT on every build.
  test("imports a plugin's source-locale catalog statically, never lazily", () => {
    const source = generatePluginCatalogsSource(
      new Map([
        [
          "en",
          [
            { path: "/site/a/locales/en.mjs", source: true },
            { path: '/site/b "q"/en.mjs', source: true },
          ],
        ],
        ["de", [{ path: "/site/a/locales/de.mjs", source: false }]],
      ]),
    );
    expect(source).toContain(
      'import * as catalog0 from "/site/a/locales/en.mjs";',
    );
    expect(source).toContain(
      'import * as catalog1 from "/site/b \\"q\\"/en.mjs";',
    );
    expect(source).toContain(
      '"en": [() => Promise.resolve(catalog0), () => Promise.resolve(catalog1)],',
    );
    expect(source).not.toContain('import("/site/a/locales/en.mjs")');
    expect(source).toContain('"de": [() => import("/site/a/locales/de.mjs")],');
  });
});
