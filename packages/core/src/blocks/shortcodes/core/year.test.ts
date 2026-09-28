import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ShortcodeContext } from "../types.js";
import { yearShortcode } from "./year.js";

function contextFor(locale: string): ShortcodeContext {
  return { siteSettings: {}, locale, entry: null };
}

describe("[year] built-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the current year for an English locale", () => {
    expect(yearShortcode.render({ atts: {}, context: contextFor("en") })).toBe(
      "2026",
    );
  });

  test("localizes the year to Arabic-Indic numerals", () => {
    expect(
      yearShortcode.render({ atts: {}, context: contextFor("ar-EG") }),
    ).toBe("٢٠٢٦");
  });
});
