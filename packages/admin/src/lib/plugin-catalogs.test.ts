import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPluginCatalogLoader } from "./plugin-catalogs.js";

describe("createPluginCatalogLoader", () => {
  beforeEach(() => {
    i18n.load({ de: {} });
    i18n.activate("de");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("is a no-op when the manifest has no URL for that (plugin, locale)", async () => {
    const importCatalog = vi.fn();
    const load = createPluginCatalogLoader({
      manifest: {
        plugin_x: { sourceLocale: "en", catalogs: { de: "/de.mjs" } },
      },
      importCatalog,
    });

    await load("plugin_y", "de"); // unknown plugin
    await load("plugin_x", "fr"); // known plugin, no catalog and no source one

    expect(importCatalog).not.toHaveBeenCalled();
  });

  test("swallows fetch failures + logs; the failing plugin falls back to descriptor.message", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const importCatalog = vi.fn(() => Promise.reject(new Error("net down")));
    const load = createPluginCatalogLoader({
      manifest: {
        plugin_x: { sourceLocale: "en", catalogs: { de: "/de.mjs" } },
      },
      importCatalog,
    });

    await expect(load("plugin_x", "de")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("plugin_x"),
      expect.any(Error),
    );
  });

  test("caches per (pluginId, locale): repeat calls don't re-import", async () => {
    const importCatalog = vi.fn(() =>
      Promise.resolve({ messages: { foo: ["bar"] } }),
    );
    const load = createPluginCatalogLoader({
      manifest: {
        plugin_x: { sourceLocale: "en", catalogs: { de: "/de.mjs" } },
      },
      importCatalog,
    });

    await load("plugin_x", "de");
    await load("plugin_x", "de");
    await load("plugin_x", "de");

    expect(importCatalog).toHaveBeenCalledTimes(1);
  });

  test("imports the catalog URL and merges messages into the active locale", async () => {
    const importCatalog = vi.fn(() =>
      Promise.resolve({ messages: { "plugin.x.label": ["Translated"] } }),
    );
    const load = createPluginCatalogLoader({
      manifest: {
        plugin_x: {
          sourceLocale: "en",
          catalogs: { de: "/_plumix/admin/plugins/plugin_x/locales/de.mjs" },
        },
      },
      importCatalog,
    });

    await load("plugin_x", "de");

    expect(importCatalog).toHaveBeenCalledWith(
      "/_plumix/admin/plugins/plugin_x/locales/de.mjs",
    );
    expect(i18n.messages["plugin.x.label"]).toEqual(["Translated"]);
  });

  test("a locale the plugin doesn't ship falls back to its source catalog", async () => {
    // The production admin can't compile `descriptor.message`, so without a
    // compiled catalog a placeholder renders raw: "Added {label} to the menu".
    i18n.load({ fr: {} });
    i18n.activate("fr");
    // Through a variable, so `lingui extract` doesn't take it for a msgid.
    const id = "plugin.x.added";
    const messages: Messages = { [id]: ["Added ", ["label"]] };
    const importCatalog = vi.fn(() => Promise.resolve({ messages }));
    const load = createPluginCatalogLoader({
      manifest: {
        plugin_x: { sourceLocale: "en", catalogs: { en: "/en.mjs" } },
      },
      importCatalog,
    });

    await load("plugin_x", "fr");

    expect(importCatalog).toHaveBeenCalledWith("/en.mjs");
    expect(i18n._(id, { label: "Team page" })).toBe("Added Team page");
  });

  describe("under a basePath", () => {
    const manifest = {
      plugin_x: {
        sourceLocale: "en",
        catalogs: {
          de: "/_plumix/admin/plugins/plugin_x/locales/de.mjs",
          en: "/_plumix/admin/plugins/plugin_x/locales/en.mjs",
        },
      },
    };

    test("a listed catalog imports under the mount", async () => {
      const importCatalog = vi.fn(() => Promise.resolve({ messages: {} }));
      const load = createPluginCatalogLoader({
        manifest,
        basePath: "/cms",
        importCatalog,
      });

      await load("plugin_x", "de");

      expect(importCatalog).toHaveBeenCalledWith(
        "/cms/_plumix/admin/plugins/plugin_x/locales/de.mjs",
      );
    });

    test("the source-locale fallback imports under the mount", async () => {
      const importCatalog = vi.fn(() => Promise.resolve({ messages: {} }));
      const load = createPluginCatalogLoader({
        manifest,
        basePath: "/cms",
        importCatalog,
      });

      await load("plugin_x", "fr");

      expect(importCatalog).toHaveBeenCalledWith(
        "/cms/_plumix/admin/plugins/plugin_x/locales/en.mjs",
      );
    });
  });

  describe("with no basePath given, the base comes from the page's <base href>", () => {
    // The shell the dispatcher serves: its `<base>` and nothing else.
    function pageWithBaseHref(href: string): void {
      vi.stubGlobal("document", {
        querySelector: (selector: string) =>
          selector === "base"
            ? {
                getAttribute: (name: string) => (name === "href" ? href : null),
              }
            : null,
      });
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const manifest = {
      plugin_x: {
        sourceLocale: "en",
        catalogs: { de: "/_plumix/admin/plugins/plugin_x/locales/de.mjs" },
      },
    };

    test("a shell served under /cms imports under the mount", async () => {
      pageWithBaseHref("/cms/_plumix/admin/");
      const importCatalog = vi.fn(() => Promise.resolve({ messages: {} }));
      const load = createPluginCatalogLoader({ manifest, importCatalog });

      await load("plugin_x", "de");

      expect(importCatalog).toHaveBeenCalledWith(
        "/cms/_plumix/admin/plugins/plugin_x/locales/de.mjs",
      );
    });

    test("a shell served at the domain root imports the manifest URL unchanged", async () => {
      pageWithBaseHref("/_plumix/admin/");
      const importCatalog = vi.fn(() => Promise.resolve({ messages: {} }));
      const load = createPluginCatalogLoader({ manifest, importCatalog });

      await load("plugin_x", "de");

      expect(importCatalog).toHaveBeenCalledWith(
        "/_plumix/admin/plugins/plugin_x/locales/de.mjs",
      );
    });
  });
});
