import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import { setI18nResolver, vMessage } from "@plumix/core/validation";

import { bootI18n } from "./i18n-boot.js";

const originalLang = document.documentElement.lang;

afterEach(() => {
  document.documentElement.lang = originalLang;
  setI18nResolver(null);
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

  test("registers a Lingui-backed resolver for valibot vMessage", async () => {
    // Sentinel: pre-boot, no real resolver. Post-boot, vMessage should
    // route through Lingui — for a descriptor with no catalog entry,
    // i18n._ falls back to `descriptor.message`, not the sentinel.
    setI18nResolver(() => "SENTINEL");
    document.documentElement.lang = "en";
    await bootI18n();
    const message = vMessage({
      id: "vmessage.boot.test",
      message: "Boot-test fallback",
    });
    expect(message()).toBe("Boot-test fallback");
    expect(message()).not.toBe("SENTINEL");
  });
});
