import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../../test/manifest.js";
import { renderRoute } from "../../../../../test/render-with-router.js";
import { stubRpc } from "../../../../../test/rpc.js";
import { Route } from "./edit.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jane = {
  id: 2,
  email: "jane@example.com",
  slug: "jane",
  name: "Jane",
  avatarUrl: null,
  role: "author" as const,
  meta: {},
  emailVerifiedAt: null,
  disabledAt: null,
  createdAt: new Date("2026-05-20T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
};

async function renderJane(): Promise<void> {
  stubRpc({ "user/get": () => jane });
  await renderRoute(Route, {
    path: "/users/$id/edit",
    url: "/users/2/edit",
    capabilities: ["user:list", "user:edit"],
  });
  await screen.findByTestId("user-edit-slug-input");
}

describe("user edit — author slug", () => {
  test("names the /authors/ URL the slug is used in", async () => {
    seedManifest({ frameworkRoutes: { author: true } });
    await renderJane();

    expect(screen.getByTestId("user-edit-slug-description")).toHaveTextContent(
      "under /authors/",
    );
  });

  test("keeps the slug but drops the hint where the site turned author routes off", async () => {
    seedManifest({ frameworkRoutes: { author: false } });
    await renderJane();

    expect(screen.getByTestId("user-edit-slug-input")).toHaveValue("jane");
    expect(screen.queryByTestId("user-edit-slug-description")).toBeNull();
  });
});

const self = { ...jane, id: 1, email: "me@example.com", slug: "me" };

async function renderSelf(): Promise<void> {
  stubRpc({
    "user/get": () => self,
    "user/pendingEmailChange": () => ({ pending: null }),
    "auth/signInMethods": () => ({ magicLink: true, oauth: [] }),
    "auth/credentials/list": () => [],
    "auth/sessions/list": () => [],
    "auth/apiTokens/list": () => [],
  });
  await renderRoute(Route, {
    path: "/users/$id/edit",
    url: "/users/1/edit",
    capabilities: ["user:list", "user:edit_own"],
  });
  await screen.findByTestId("user-edit-slug-input");
}

describe("user edit — what the deployment refuses", () => {
  test("offers passkeys, API tokens and an email change where nothing is refused", async () => {
    seedManifest({ refusedAdminAreas: [] });
    await renderSelf();

    expect(screen.getByTestId("profile-passkeys-card")).toBeVisible();
    expect(screen.getByTestId("api-tokens-card")).toBeVisible();
    expect(
      await screen.findByTestId("user-edit-email-change-button"),
    ).toBeVisible();
  });

  test("hides every surface of a refused area and keeps the rest", async () => {
    seedManifest({
      refusedAdminAreas: [
        "apiTokens",
        "deviceAuthorization",
        "passkeys",
        "oauthLinking",
        "emailDelivery",
      ],
    });
    await renderSelf();

    expect(screen.getByTestId("language-card")).toBeVisible();
    expect(screen.getByTestId("profile-sessions-card")).toBeVisible();
    expect(screen.queryByTestId("profile-passkeys-card")).toBeNull();
    expect(screen.queryByTestId("api-tokens-card")).toBeNull();
    expect(screen.getByTestId("user-edit-email")).toHaveTextContent(
      "me@example.com",
    );
    expect(screen.queryByTestId("user-edit-email-change-button")).toBeNull();
    expect(
      screen.queryByTestId("user-edit-email-change-unavailable"),
    ).toBeNull();
  });
});
