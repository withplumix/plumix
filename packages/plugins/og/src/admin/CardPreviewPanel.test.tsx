import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { i18n, I18nProvider } from "plumix/i18n";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { CardPreviewPanel } from "./CardPreviewPanel.js";

i18n.load({ en: {} });
i18n.activate("en");

describe("CardPreviewPanel", () => {
  test("asks for nothing on the create form, where there is no entry yet", () => {
    // No QueryClientProvider: a panel that reached for a preview would throw.
    const html = renderToString(
      <I18nProvider i18n={i18n}>
        <CardPreviewPanel entryId={null} disabled={false} testId="preview" />
      </I18nProvider>,
    );

    expect(html).toContain("Save the entry to see how it will be shared.");
  });

  test("a read-only form disables the refresh button", () => {
    const client = new QueryClient();
    client.setQueryData(["og", "card-preview", 7], {
      outcome: "card",
      skipped: null,
      src: "data:image/png;base64,AAAA",
    });

    const html = renderToString(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <CardPreviewPanel entryId={7} disabled={true} testId="preview" />
        </QueryClientProvider>
      </I18nProvider>,
    );

    expect(html).toMatch(
      /<button(?=[^>]*data-testid="preview-refresh")(?=[^>]*disabled="")/,
    );
  });
});
