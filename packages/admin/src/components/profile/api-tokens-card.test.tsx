import { orpc } from "@/lib/orpc.js";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SelfApiTokensCard } from "./api-tokens-card.js";

/** Renders the card with no tokens listed. */
function render(canCreate: boolean): string {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    orpc.auth.apiTokens.list.queryKey({ input: {} }),
    [],
  );
  return renderToStaticMarkup(
    <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
      <QueryClientProvider client={queryClient}>
        <SelfApiTokensCard canCreate={canCreate} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe("your own API tokens card", () => {
  test("offers the create form to someone who holds user:create_tokens", () => {
    const html = render(true);

    expect(html).toContain('data-testid="api-tokens-create-name-input"');
  });

  test("hides the create form from someone who lacks user:create_tokens", () => {
    const html = render(false);

    expect(html).not.toContain('data-testid="api-tokens-create-name-input"');
  });

  test("with no tokens and no create form, doesn't point to one", () => {
    const html = render(false);

    expect(html).toContain('data-testid="api-tokens-empty"');
    expect(html).not.toContain("Mint one above");
  });
});
