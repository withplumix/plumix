import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  mockSession,
  withCapabilities,
} from "./support/rpc-mock.js";

// Build-time alias seam proof — assertions are inline below, one per
// failure mode of the seam (React, React-Query, useNavigate, Tailwind).

const PROOF_CAPABILITY = "plugin:runtime-proof";

const AUTHED_WITH_PROOF_CAP = withCapabilities(AUTHED_ADMIN, PROOF_CAPABILITY);

const MANIFEST: PlumixManifest = {
  adminNav: [
    {
      id: "appearance",
      label: "Appearance",
      priority: 40,
      items: [
        {
          to: "/pages/__runtime-proof",
          label: "Runtime Proof",
          order: 1,
          capability: PROOF_CAPABILITY,
          coreIcon: "puzzle",
          component: {
            package: "@plumix/e2e/runtime-proof",
            export: "MediaLibrary",
          },
        },
      ],
    },
  ],
};

test.describe("plugin runtime alias seam", () => {
  test("plugin shares React, QueryClient, router, and Tailwind with the host", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST);
    await mockSession(page, AUTHED_WITH_PROOF_CAP);

    await page.goto("pages/__runtime-proof");

    // The plugin's component mounted at all → admin's catch-all route
    // resolved the registered component out of `window.plumix`.
    const root = page.getByTestId("runtime-proof");
    await expect(root).toBeVisible();

    // (1) React state — useState renders + updates
    const count = page.getByTestId("runtime-proof-count");
    await expect(count).toHaveText("0");
    await page.getByTestId("runtime-proof-inc").click();
    await expect(count).toHaveText("1");

    // (2) QueryClient is shared
    await expect(
      page.getByTestId("runtime-proof-shares-queryclient"),
    ).toHaveAttribute("data-shared", "true");

    // (3) useQuery actually runs end-to-end
    const queryStatus = page.getByTestId("runtime-proof-query-status");
    await expect(queryStatus).toHaveAttribute("data-status", "success");
    await expect(queryStatus).toHaveAttribute("data-http", "200");

    // (4) Cache is shared — getQueryData reads back the resolved value
    await expect(
      page.getByTestId("runtime-proof-shares-cache"),
    ).toHaveAttribute("data-shared", "true");

    // (5) Tailwind utility class lands on the rendered button
    const incButton = page.getByTestId("runtime-proof-inc");
    const buttonBg = await incButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // `bg-primary` resolves to a non-transparent colour via admin's
    // theme tokens. Exact RGB depends on theme; assert it's not the
    // transparent default and not white-on-white.
    expect(buttonBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(buttonBg).not.toBe("rgb(255, 255, 255)");

    // (6) Router hook navigates inside admin
    await page.getByTestId("runtime-proof-navigate").click();
    await expect(page).toHaveURL(/\/_plumix\/admin\/?$/);
  });
});
