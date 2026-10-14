import { i18n, I18nProvider } from "plumix/i18n";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SerpPreviewPanel } from "./SerpPreviewPanel.js";

i18n.load({ en: {} });
i18n.activate("en");

describe("SerpPreviewPanel", () => {
  test("asks for nothing on the create form, where there is no entry yet", () => {
    // No QueryClientProvider: a panel that reached for a preview would throw.
    const html = renderToString(
      <I18nProvider i18n={i18n}>
        <SerpPreviewPanel
          entryId={null}
          overrides={{ title: null, description: null, noindex: false }}
          disabled={false}
          testId="preview"
        />
      </I18nProvider>,
    );

    expect(html).toContain(
      "Save the entry to see how it will look in search results.",
    );
  });
});
