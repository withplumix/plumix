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
      manifest: { plugin_x: { catalogs: { de: "/de.mjs" } } },
      importCatalog,
    });

    await load("plugin_y", "de"); // unknown plugin
    await load("plugin_x", "fr"); // known plugin, unknown locale

    expect(importCatalog).not.toHaveBeenCalled();
  });

  test("swallows fetch failures + logs; the failing plugin falls back to descriptor.message", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const importCatalog = vi.fn(() => Promise.reject(new Error("net down")));
    const load = createPluginCatalogLoader({
      manifest: { plugin_x: { catalogs: { de: "/de.mjs" } } },
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
      manifest: { plugin_x: { catalogs: { de: "/de.mjs" } } },
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
});
