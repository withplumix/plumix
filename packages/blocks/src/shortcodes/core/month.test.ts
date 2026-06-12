import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ShortcodeContext } from "../types.js";
import { expandShortcodes } from "../expand.js";
import { monthShortcode } from "./month.js";

function contextFor(locale: string): ShortcodeContext {
  return { siteSettings: {}, locale, entry: null };
}

function render(locale: string, format?: string): string {
  return monthShortcode.render({
    atts: format === undefined ? {} : { format },
    context: contextFor(locale),
  });
}

describe("[month] built-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the full month name by default", () => {
    expect(render("en")).toBe("June");
  });

  test("format=short renders the abbreviated month", () => {
    expect(render("en", "short")).toBe("Jun");
  });

  test("format=numeric renders the month number", () => {
    expect(render("en", "numeric")).toBe("6");
  });

  test("localizes the month name to the context locale", () => {
    expect(render("fr")).toBe("juin");
  });

  test("an unrecognized format falls back to the full name", () => {
    expect(render("en", "2-digit")).toBe("June");
  });

  test("the format attribute flows through the expander to the built-in", () => {
    const reg = new Map([[monthShortcode.name, monthShortcode]]);
    expect(
      expandShortcodes('[month format="short"]', reg, contextFor("en")),
    ).toBe("Jun");
  });
});
