import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { stubRpc } from "../../../test/rpc.js";
import { PasskeysCard } from "./passkeys-card.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Passkey = Awaited<
  ReturnType<AppRouterClient["auth"]["credentials"]["list"]>
>[number];

function passkey(id: string): Passkey {
  return {
    id,
    name: `Key ${id}`,
    isBackedUp: false,
    transports: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    lastUsedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function renderCard(): void {
  renderWithI18n(
    <QueryClientProvider client={createQueryClient()}>
      <PasskeysCard userEmail="admin@example.test" />
    </QueryClientProvider>,
  );
}

describe("PasskeysCard", () => {
  test("shows the localized retry copy when renaming fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/credentials/list": () => [passkey("a")],
      "auth/credentials/rename": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderCard();

    await userEvent.click(
      await screen.findByTestId("profile-passkey-rename-button"),
    );
    await userEvent.type(
      screen.getByTestId("profile-passkey-rename-input"),
      " renamed",
    );
    await userEvent.click(screen.getByTestId("profile-passkey-rename-submit"));

    expect(
      await screen.findByTestId("profile-passkey-rename-error"),
    ).toHaveTextContent("Couldn't rename the passkey. Try again.");
  });

  test("shows the localized retry copy when deleting fails for no known reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/credentials/list": () => [passkey("a"), passkey("b")],
      "auth/credentials/delete": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    renderCard();

    const [deleteButton] = await screen.findAllByTestId(
      "profile-passkey-delete-button",
    );
    if (!deleteButton) throw new Error("no passkey row rendered");
    await userEvent.click(deleteButton);
    await userEvent.click(screen.getByTestId("profile-passkey-delete-confirm"));

    expect(
      await screen.findByTestId("profile-passkey-delete-error"),
    ).toHaveTextContent("Couldn't delete the passkey. Try again.");
  });

  test("shows the localized retry copy when enrolment fails for a reason it doesn't name", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({ "auth/credentials/list": () => [passkey("a")] });
    const rpcFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (input: Request | string, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input.url;
        if (!url.includes("/passkey/register/options")) {
          return rpcFetch(input, init);
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "challenge_not_found" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    );
    renderCard();

    await userEvent.click(screen.getByTestId("profile-passkeys-enroll-button"));

    expect(
      await screen.findByTestId("profile-passkeys-enroll-error"),
    ).toHaveTextContent("Couldn't enrol the passkey. Try again.");
  });
});
