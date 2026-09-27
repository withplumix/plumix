import { describe, expect, test } from "vitest";

import { generatePluginCatalogsSource } from "./plugin-catalogs-codegen.js";

describe("generatePluginCatalogsSource", () => {
  test("no catalogs yields an empty locale map", () => {
    expect(generatePluginCatalogsSource(new Map())).toContain(
      "export default {};",
    );
  });

  test("lazy-imports every catalog under its locale, escaped", () => {
    const source = generatePluginCatalogsSource(
      new Map([
        ["de", ["/site/a/locales/de.mjs", '/site/b "q"/de.mjs']],
        ["uk", ["/site/a/locales/uk.mjs"]],
      ]),
    );
    expect(source).toContain(
      '"de": [() => import("/site/a/locales/de.mjs"), () => import("/site/b \\"q\\"/de.mjs")],',
    );
    expect(source).toContain('"uk": [() => import("/site/a/locales/uk.mjs")],');
  });
});
