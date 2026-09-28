import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { stubRpc } from "../../../test/rpc.js";
import { SessionsCard } from "./sessions-card.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SESSIONS = [
  {
    id: "current",
    ipAddress: null,
    userAgent: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
    current: true,
  },
  {
    id: "other",
    ipAddress: null,
    userAgent: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
    current: false,
  },
];

function renderCard(): void {
  renderWithI18n(
    <QueryClientProvider client={createQueryClient()}>
      <SessionsCard />
    </QueryClientProvider>,
  );
}

describe("SessionsCard", () => {
  test("shows the localized retry copy when signing out other devices fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/sessions/list": () => SESSIONS,
      "auth/sessions/revokeOthers": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderCard();

    await userEvent.click(
      await screen.findByTestId("profile-sessions-revoke-button"),
    );

    expect(
      await screen.findByTestId("profile-sessions-error"),
    ).toHaveTextContent("Couldn't revoke sessions. Try again.");
  });

  test("shows the localized retry copy when revoking one session fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/sessions/list": () => SESSIONS,
      "auth/sessions/revoke": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderCard();

    await userEvent.click(
      await screen.findByTestId("profile-session-revoke-button"),
    );
    await userEvent.click(screen.getByTestId("profile-session-revoke-confirm"));

    expect(
      await screen.findByTestId("profile-session-revoke-error"),
    ).toHaveTextContent("Couldn't revoke the session. Try again.");
  });
});
