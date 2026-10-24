import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import { setI18nResolver, vMessage } from "@plumix/core/validation";

import type { AdminCatalogs } from "./i18n-boot.js";
import linguiConfig from "../../lingui.config.js";
import { SOURCE_LOCALE } from "./constants.js";
import { bootI18n } from "./i18n-boot.js";

test("SOURCE_LOCALE is the sourceLocale in lingui.config.ts", () => {
  expect(SOURCE_LOCALE).toBe(linguiConfig.sourceLocale);
});

/**
 * The bundled catalog set is whatever `i18n:compile` last wrote to disk, so
 * these tests state their own: English + German present, nothing else — enough
 * to drive the activate / fallback logic.
 */
const catalog = () => Promise.resolve({ messages: {} });
const messages = (id: string, text: string) => () =>
  Promise.resolve({ messages: { [id]: [text] } });
const SHIPPED: AdminCatalogs = {
  admin: {
    "../../locales/en.mjs": catalog,
    "../../locales/de.mjs": catalog,
  },
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

  test("activates a regional locale with its catalog locale's messages", async () => {
    await bootI18n({
      lang: "de-AT",
      catalogs: {
        admin: {
          ...SHIPPED.admin,
          "../../locales/de.mjs": messages("test.admin", "Abmelden"),
        },
        editor: {
          "../../../admin-editor/locales/de.mjs": messages(
            "test.editor",
            "Block einfügen",
          ),
        },
        blocks: {
          "../../../core/locales/blocks-en.mjs": messages(
            "test.blocks",
            "Add block",
          ),
        },
      },
      catalogLocales: {
        admin: { "de-AT": "de" },
        editor: { "de-AT": "de" },
        blocks: { "de-AT": "en" },
      },
    });
    expect(i18n.locale).toBe("de-AT");
    expect(i18n.messages).toEqual({
      "test.admin": ["Abmelden"],
      "test.editor": ["Block einfügen"],
      "test.blocks": ["Add block"],
    });
  });

  test("activates zh-CN with the zh-CN catalog, keeping its case and region", async () => {
    await bootI18n({
      lang: "zh-CN",
      catalogs: {
        admin: {
          ...SHIPPED.admin,
          "../../locales/zh-CN.mjs": messages("test.admin", "退出登录"),
        },
        editor: {},
        blocks: {},
      },
      catalogLocales: {
        admin: { "zh-CN": "zh-CN" },
        editor: { "zh-CN": "en" },
        blocks: { "zh-CN": "en" },
      },
    });
    expect(i18n.locale).toBe("zh-CN");
    expect(i18n.messages).toEqual({ "test.admin": ["退出登录"] });
  });

  test("reads a locale the manifest doesn't project by its own code, never by its language", async () => {
    await bootI18n({
      lang: "de-DE",
      catalogs: {
        ...SHIPPED,
        admin: {
          ...SHIPPED.admin,
          "../../locales/de.mjs": messages("test.admin", "Abmelden"),
        },
      },
    });
    expect(i18n.locale).toBe("de-DE");
    expect(i18n.messages).toEqual({});
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
