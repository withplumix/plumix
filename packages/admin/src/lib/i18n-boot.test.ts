import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import { setI18nResolver, vMessage } from "@plumix/core/validation";

import type { AdminCatalogs } from "./i18n-boot.js";
import linguiConfig from "../../lingui.config.js";
import { bootI18n, SOURCE_LOCALE } from "./i18n-boot.js";

test("SOURCE_LOCALE is the sourceLocale in lingui.config.ts", () => {
  expect(SOURCE_LOCALE).toBe(linguiConfig.sourceLocale);
});

/**
 * The bundled catalog set is whatever `i18n:compile` last wrote to disk, so
 * these tests state their own: English + German present, nothing else — enough
 * to drive the activate / region-strip / fallback logic.
 */
const catalog = () => Promise.resolve({ messages: {} });
const SHIPPED: AdminCatalogs = {
  admin: {
    "../../locales/en.mjs": catalog,
    "../../locales/de.mjs": catalog,
  },
  plugins: {},
  editor: {},
  blocks: {},
};

afterEach(() => {
  setI18nResolver(null);
});

describe("bootI18n", () => {
  test("activates the requested locale when its catalog ships", async () => {
    await bootI18n({ lang: "de", catalogs: SHIPPED });
    expect(i18n.locale).toBe("de");
  });

  test("strips region subtags before lookup", async () => {
    await bootI18n({ lang: "de-DE", catalogs: SHIPPED });
    expect(i18n.locale).toBe("de");
  });

  test("falls back to the source locale for unshipped tags", async () => {
    await bootI18n({ lang: "fr", catalogs: SHIPPED });
    expect(i18n.locale).toBe("en");
  });

  test("falls back to the source locale when the page has no lang", async () => {
    await bootI18n({ lang: "", catalogs: SHIPPED });
    expect(i18n.locale).toBe("en");
  });

  test("registers a Lingui-backed resolver for valibot vMessage", async () => {
    // Sentinel: pre-boot, no real resolver. Post-boot, vMessage should
    // route through Lingui — for a descriptor with no catalog entry,
    // i18n._ falls back to `descriptor.message`, not the sentinel.
    setI18nResolver(() => "SENTINEL");
    await bootI18n({ lang: "en", catalogs: SHIPPED });
    const message = vMessage({
      id: "vmessage.boot.test",
      message: "Boot-test fallback",
    });
    expect(message()).toBe("Boot-test fallback");
  });

  test("merges the blocks catalog under the editor's for the active locale", async () => {
    await bootI18n({
      lang: "de",
      catalogs: {
        ...SHIPPED,
        blocks: {
          "../../../core/locales/blocks-de.mjs": () =>
            Promise.resolve({
              messages: {
                "blocks.appender.addBlock": ["Block hinzufügen"],
                "shared.id": ["from blocks"],
              },
            }),
        },
        editor: {
          "../../../admin-editor/locales/de.mjs": () =>
            Promise.resolve({ messages: { "shared.id": ["from editor"] } }),
        },
      },
    });
    expect(i18n.messages["blocks.appender.addBlock"]).toEqual([
      "Block hinzufügen",
    ]);
    expect(i18n.messages["shared.id"]).toEqual(["from editor"]);
  });
});
