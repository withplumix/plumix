import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import {
  CLDR_PARENT_LOCALES_FILE,
  renderCldrParentLocales,
} from "../../scripts/cldr-parent-locales.js";

test("the committed CLDR parent locales match the installed cldr-core", () => {
  expect(readFileSync(CLDR_PARENT_LOCALES_FILE, "utf8")).toBe(
    renderCldrParentLocales(),
  );
});
