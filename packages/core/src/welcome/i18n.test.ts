import { describe, expect, test } from "vitest";

import { loadWelcomeCatalog, welcomeMessages } from "./i18n.js";

describe("welcome catalogs", () => {
  test("resolves the English source strings", async () => {
    await loadWelcomeCatalog("en");
    expect(welcomeMessages("en").heading).toBe("Your site is ready.");
  });

  test("falls back to English for a locale with no catalog entry", async () => {
    await loadWelcomeCatalog("xx");
    expect(welcomeMessages("xx").heading).toBe("Your site is ready.");
  });
});
