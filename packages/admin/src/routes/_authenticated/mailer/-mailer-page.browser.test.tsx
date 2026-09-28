import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { configuredSlotsOf } from "@plumix/core/manifest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderWithI18n } from "../../../../test/render-with-i18n.js";
import { stubRpc } from "../../../../test/rpc.js";
import { MailerPage } from "./-mailer-page.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  test("shows the localized retry copy for a failure it has no reason for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedManifest({
      configuredSlots: { ...configuredSlotsOf({}), mailer: true },
    });
    stubRpc({
      "auth/mailer/testSend": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderPage();

    fireEvent.click(screen.getByTestId("mailer-test-submit"));

    expect(await screen.findByTestId("mailer-test-error")).toHaveTextContent(
      "Couldn't send the test message. Try again.",
    );
  });
});
