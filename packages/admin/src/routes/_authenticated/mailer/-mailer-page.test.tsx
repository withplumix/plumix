import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { configuredSlotsOf } from "@plumix/core/manifest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderWithI18n } from "../../../../test/render-with-i18n.js";
import { MailerPage } from "./-mailer-page.js";

afterEach(() => {
  cleanup();
  clearManifest();
});

function renderPage(): void {
  renderWithI18n(
    <QueryClientProvider client={createQueryClient()}>
      <MailerPage defaultRecipient="ops@example.com" />
    </QueryClientProvider>,
  );
}

describe("MailerPage", () => {
  test("explains the missing mailer slot instead of offering a test send", () => {
    seedManifest({ configuredSlots: configuredSlotsOf({}) });
    renderPage();

    expect(screen.getByTestId("mailer-not-configured")).toBeVisible();
    expect(screen.queryByTestId("mailer-test-submit")).toBeNull();
  });

  test("offers the test send when the mailer slot is configured", () => {
    seedManifest({
      configuredSlots: { ...configuredSlotsOf({}), mailer: true },
    });
    renderPage();

    expect(screen.getByTestId("mailer-test-submit")).toBeVisible();
    expect(screen.queryByTestId("mailer-not-configured")).toBeNull();
  });
});
