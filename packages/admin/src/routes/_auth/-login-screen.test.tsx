import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithRouter } from "../../../test/render-with-router.js";
import { settleRpc, stubRpc } from "../../../test/rpc.js";
import { LoginScreen } from "./-login-screen.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLogin(): Promise<void> {
  await renderWithRouter(
    <QueryClientProvider client={createQueryClient()}>
      <LoginScreen search={{}} />
    </QueryClientProvider>,
  );
  await screen.findByTestId("login-passkey-submit");
}

describe("LoginScreen", () => {
  test("offers no magic link when the site has not configured it", async () => {
    stubRpc({ "auth/signInMethods": () => ({ magicLink: false, oauth: [] }) });
    await renderLogin();
    await settleRpc();

    expect(
      screen.queryByTestId("login-magic-link-submit"),
    ).not.toBeInTheDocument();
  });

  test("offers the magic link when the site has configured it", async () => {
    stubRpc({ "auth/signInMethods": () => ({ magicLink: true, oauth: [] }) });
    await renderLogin();

    expect(
      await screen.findByTestId("login-magic-link-submit"),
    ).toBeInTheDocument();
  });

  test("shows the localized retry copy when the link request fails", async () => {
    // The magic-link request isn't an RPC, so the stub answers it 404.
    stubRpc({ "auth/signInMethods": () => ({ magicLink: true, oauth: [] }) });
    await renderLogin();

    fireEvent.change(screen.getByTestId("login-email-input"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(await screen.findByTestId("login-magic-link-submit"));

    expect(
      await screen.findByTestId("login-magic-link-error"),
    ).toHaveTextContent("Couldn't send the link. Try again.");
  });

  test("asks for an email before requesting a link", async () => {
    stubRpc({ "auth/signInMethods": () => ({ magicLink: true, oauth: [] }) });
    await renderLogin();

    fireEvent.click(await screen.findByTestId("login-magic-link-submit"));

    expect(
      await screen.findByTestId("login-magic-link-error"),
    ).toHaveTextContent("Enter your email above first.");
  });

  test("renders a button per configured OAuth provider", async () => {
    stubRpc({
      "auth/signInMethods": () => ({
        magicLink: false,
        oauth: [{ key: "github", label: "GitHub" }],
      }),
    });
    await renderLogin();

    expect(
      (await screen.findByTestId("login-oauth-github")).getAttribute("href"),
    ).toBe("/_plumix/auth/oauth/github/start");
  });
});
