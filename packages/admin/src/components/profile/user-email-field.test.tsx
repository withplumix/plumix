import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { settleRpc, stubRpc } from "../../../test/rpc.js";
import { UserEmailField } from "./user-email-field.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderField(): void {
  renderWithI18n(
    <QueryClientProvider client={createQueryClient()}>
      <UserEmailField userId={1} email="admin@example.test" canEdit />
    </QueryClientProvider>,
  );
}

describe("UserEmailField", () => {
  test("explains why the email can't change when magic link isn't configured", async () => {
    stubRpc({
      "auth/signInMethods": () => ({ magicLink: false, oauth: [] }),
      "user/pendingEmailChange": () => ({ pending: null }),
    });
    renderField();

    expect(
      await screen.findByTestId("user-edit-email-change-unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("user-edit-email").textContent).toBe(
      "admin@example.test",
    );
    expect(
      screen.queryByTestId("user-edit-email-change-button"),
    ).not.toBeInTheDocument();
  });

  test("offers the change when magic link is configured", async () => {
    stubRpc({
      "auth/signInMethods": () => ({ magicLink: true, oauth: [] }),
      "user/pendingEmailChange": () => ({ pending: null }),
    });
    renderField();

    expect(
      await screen.findByTestId("user-edit-email-change-button"),
    ).toBeInTheDocument();
    await settleRpc();
    expect(
      screen.queryByTestId("user-edit-email-change-unavailable"),
    ).not.toBeInTheDocument();
  });

  test("shows the localized retry copy for a failure it has no reason for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/signInMethods": () => ({ magicLink: true, oauth: [] }),
      "user/pendingEmailChange": () => ({ pending: null }),
      "user/requestEmailChange": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderField();

    await userEvent.click(
      await screen.findByTestId("user-edit-email-change-button"),
    );
    await userEvent.type(
      screen.getByTestId("user-edit-email-change-input"),
      "new@example.test",
    );
    await userEvent.click(screen.getByTestId("user-edit-email-change-submit"));

    expect(
      await screen.findByTestId("user-edit-email-change-error"),
    ).toHaveTextContent("Couldn't request the change. Try again.");
  });
});
