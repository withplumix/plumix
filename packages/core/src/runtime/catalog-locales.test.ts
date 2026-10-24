import { describe, expect, test } from "vitest";

import { projectCoreCatalogLocales } from "./catalog-locales.js";

describe("projectCoreCatalogLocales", () => {
  test("a site with only the default locale projects it to itself, for every surface", () => {
    expect(projectCoreCatalogLocales(["en"])).toEqual({
      blocks: { en: "en" },
      mail: { en: "en" },
      welcome: { en: "en" },
      "admin-bar": { en: "en" },
    });
  });

  test("an enabled locale with no catalog reads the source locale", () => {
    expect(projectCoreCatalogLocales(["en", "xx"]).blocks).toEqual({
      en: "en",
      xx: "en",
    });
  });
});
