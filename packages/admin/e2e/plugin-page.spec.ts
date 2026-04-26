import { expect, test } from "@playwright/test";

import type { AuthSessionOutput } from "@plumix/core";
import type { PlumixManifest } from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  mockSession,
  withCapabilities,
} from "./support/rpc-mock.js";

const AUTHED_ADMIN_WITH_MENU_CAP = withCapabilities(
  AUTHED_ADMIN,
  "menu:manage",
);

const AUTHED_EDITOR: AuthSessionOutput = {
  user: {
    id: 2,
    email: "editor@example.test",
    name: "Editor",
    avatarUrl: null,
    role: "editor",
    capabilities: [
      "entry:post:create",
      "entry:post:edit_any",
      "entry:post:edit_own",
      "entry:post:read",
      "term:taxonomy:manage",
    ],
  },
  needsBootstrap: false,
};

const MANIFEST_WITH_PLUGIN_PAGE: PlumixManifest = {
  adminNav: [
    {
      id: "appearance",
      label: "Appearance",
      priority: 40,
      items: [
        {
          to: "/pages/menus",
          label: "Menus",
          order: 1,
          capability: "menu:manage",
          coreIcon: "puzzle",
          component: {
            package: "@example/plugin-menus",
            export: "MenusPage",
          },
        },
      ],
    },
  ],
};

test.describe("plugin catch-all route (/pages/$)", () => {
  test("unknown plugin path falls through to the TanStack Router not-found handler", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_ADMIN_WITH_MENU_CAP);

    await page.goto("pages/unknown");
    await expect(
      page.getByTestId("plugin-page__not-loaded__/unknown"),
    ).not.toBeVisible();
  });

  test("plugin path without the required capability redirects to dashboard", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_EDITOR);

    await page.goto("pages/menus");
    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("plugin path with component not registered shows the not-loaded diagnostic", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_PLUGIN_PAGE);
    await mockSession(page, AUTHED_ADMIN_WITH_MENU_CAP);

    await page.goto("pages/menus");
    await expect(
      page.getByTestId("plugin-page__not-loaded__/menus"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Plugin not loaded" }),
    ).toBeVisible();
  });
});
