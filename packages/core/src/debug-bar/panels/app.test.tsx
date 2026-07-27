import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { DebugContext } from "../snapshot.js";
import { makeSnapshot } from "../snapshot-fixture.js";
import { appPanel } from "./app.js";

function render(context: Partial<DebugContext>): string {
  return renderToStaticMarkup(
    <>{appPanel.render(makeSnapshot({ context }))}</>,
  );
}

describe("appPanel", () => {
  test("shows config, locale, plugins, and content types", () => {
    const html = render({
      siteName: "My Site",
      locale: { code: "en", direction: "ltr" },
      plugins: {
        ids: ["blog", "media"],
        entryTypes: ["post", "page"],
        termTaxonomies: ["category"],
      },
    });

    expect(html).toContain("My Site"); // config
    expect(html).toContain("en"); // locale
    expect(html).toContain("blog"); // plugin id
    expect(html).toContain("media");
    expect(html).toContain("post"); // entry type
    expect(html).toContain("category"); // taxonomy
  });

  test("marks wired slots and leaves unwired ones blank", () => {
    const html = render({
      slots: { cache: true, storage: false, mailer: false, images: false },
    });

    // cache is wired, storage is not
    expect(html).toContain("Cache");
    expect(html).toContain("Storage");
    expect(html).toContain("✓"); // something wired
    expect(html).toContain("—"); // something not
  });
});
