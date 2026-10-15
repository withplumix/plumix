import { describe, expect, test } from "vitest";

import { hasLocaleChoice } from "./login-locale-switcher.js";

describe("hasLocaleChoice", () => {
  test("a site with one enabled locale offers no choice", () => {
    expect(
      hasLocaleChoice({
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", direction: "ltr", enabled: true },
          ],
        },
      }),
    ).toBe(false);
  });

  test("a site with two enabled locales offers a choice", () => {
    expect(
      hasLocaleChoice({
        i18n: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", direction: "ltr", enabled: true },
            {
              code: "uk",
              label: "Українська",
              direction: "ltr",
              enabled: true,
            },
          ],
        },
      }),
    ).toBe(true);
  });

  test("a manifest with no i18n block offers no choice", () => {
    expect(hasLocaleChoice({})).toBe(false);
  });
});
