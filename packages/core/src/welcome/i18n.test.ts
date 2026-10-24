import { describe, expect, test } from "vitest";

import { welcomeCatalogs } from "./i18n.js";

describe("welcome catalogs", () => {
  test("resolves the English source strings", async () => {
    const catalogs = welcomeCatalogs();
    await catalogs.load("en");
    expect(catalogs.strings("en").heading).toBe("Your site is ready.");
  });

  test("falls back to English for a locale with no catalog entry", async () => {
    const catalogs = welcomeCatalogs();
    await catalogs.load("xx");
    expect(catalogs.strings("xx").heading).toBe("Your site is ready.");
  });

  test("reads an enabled regional locale from its catalog locale", async () => {
    const catalogs = welcomeCatalogs(
      { "de-AT": "de" },
      {
        de: () =>
          Promise.resolve({
            messages: { "core.welcome.heading": "Deine Seite ist bereit." },
          }),
      },
    );
    await catalogs.load("de-AT");
    expect(catalogs.strings("de-AT").heading).toBe("Deine Seite ist bereit.");
  });
});
