import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import { bootI18n } from "./i18n-boot.js";

const originalLang = document.documentElement.lang;

afterEach(() => {
  document.documentElement.lang = originalLang;
});

describe("bootI18n", () => {
  test("activates the requested locale when its catalog ships", async () => {
    document.documentElement.lang = "de";
    await bootI18n();
    expect(i18n.locale).toBe("de");
  });

  test("strips region subtags before lookup", async () => {
    document.documentElement.lang = "de-DE";
    await bootI18n();
    expect(i18n.locale).toBe("de");
  });

  test("falls back to the source locale for unshipped tags", async () => {
    document.documentElement.lang = "fr";
    await bootI18n();
    expect(i18n.locale).toBe("en");
  });

  test("falls back to the source locale when documentElement.lang is empty", async () => {
    document.documentElement.lang = "";
    await bootI18n();
    expect(i18n.locale).toBe("en");
  });
});
