import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import { appPanel } from "./app.js";

function ctxWith(overrides: Record<string, unknown>): AppContext {
  return {
    origin: "https://cms.example",
    basePath: "",
    siteName: "My Site",
    locale: { code: "en", direction: "ltr" },
    plugins: {
      pluginIds: [],
      entryTypes: new Map(),
      termTaxonomies: new Map(),
    },
    ...overrides,
  } as unknown as AppContext;
}

describe("appPanel", () => {
  test("shows config, locale, plugins, and content types", () => {
    const ctx = ctxWith({
      plugins: {
        pluginIds: ["blog", "media"],
        entryTypes: new Map([
          ["post", {}],
          ["page", {}],
        ]),
        termTaxonomies: new Map([["category", {}]]),
      },
    });

    const html = renderToStaticMarkup(<>{appPanel.render(ctx)}</>);

    expect(html).toContain("My Site"); // config
    expect(html).toContain("en"); // locale
    expect(html).toContain("blog"); // plugin id
    expect(html).toContain("media");
    expect(html).toContain("post"); // entry type
    expect(html).toContain("category"); // taxonomy
  });

  test("marks wired slots and leaves unwired ones blank", () => {
    const html = renderToStaticMarkup(
      <>{appPanel.render(ctxWith({ cache: {} }))}</>,
    );

    // cache is wired, storage is not
    expect(html).toContain("Cache");
    expect(html).toContain("Storage");
    expect(html).toContain("✓"); // something wired
    expect(html).toContain("—"); // something not
  });
});
