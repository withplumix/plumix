import { expect, test } from "vitest";

import linguiConfig from "../../lingui.config.js";
import { SOURCE_LOCALE } from "./i18n-boot.js";

test("SOURCE_LOCALE is the sourceLocale in lingui.config.ts", () => {
  expect(SOURCE_LOCALE).toBe(linguiConfig.sourceLocale);
});
