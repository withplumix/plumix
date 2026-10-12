import { expect, test } from "vitest";

import linguiConfig from "../../lingui.config.js";
import { SOURCE_LOCALE } from "./i18n-boot.js";

test("falls back to the locale the admin's catalogs are authored in", () => {
  expect(SOURCE_LOCALE).toBe(linguiConfig.sourceLocale);
});
