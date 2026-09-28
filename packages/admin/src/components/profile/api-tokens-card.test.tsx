import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { stubRpc } from "../../../test/rpc.js";
import { AdminApiTokensCard, SelfApiTokensCard } from "./api-tokens-card.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ADMIN_TOKENS: Awaited<
  ReturnType<AppRouterClient["auth"]["apiTokens"]["adminList"]>
> = {
  items: [
    {
      id: "tok_1",
      name: "CI deploy key",
      prefix: "pmx_abc",
      scopes: null,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: null,
      user: { id: 2, email: "editor@example.test", name: null },
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

describe("ApiTokensCard", () => {
  test("shows the localized retry copy when minting fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/apiTokens/list": () => [],
      "auth/apiTokens/create": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderWithI18n(
      <QueryClientProvider client={createQueryClient()}>
        <SelfApiTokensCard />
      </QueryClientProvider>,
    );

    await userEvent.type(
      screen.getByTestId("api-tokens-create-name-input"),
      "CI deploy key",
    );
    await userEvent.click(screen.getByTestId("api-tokens-create-submit"));

    expect(
      await screen.findByTestId("api-tokens-create-error"),
    ).toHaveTextContent("Couldn't mint token. Try again.");
  });

  test("shows the localized retry copy when revoking fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/apiTokens/adminList": () => ADMIN_TOKENS,
      "auth/apiTokens/adminRevoke": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderWithI18n(
      <QueryClientProvider client={createQueryClient()}>
        <AdminApiTokensCard userId={2} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByTestId("api-tokens-revoke-tok_1"));
    await userEvent.click(
      screen.getByTestId("api-tokens-revoke-confirm-button"),
    );

    expect(
      await screen.findByTestId("api-tokens-revoke-error"),
    ).toHaveTextContent("Couldn't revoke. Try again.");
  });
});
