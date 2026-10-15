import { expect, test } from "@playwright/test";

import { configuredSlotsOf, emptyManifest } from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
} from "./support/rpc-mock.js";

const MAILER_CONFIGURED = { ...configuredSlotsOf({}), mailer: true };

test.describe("/mailer", () => {
  test("without a mailer slot the page explains it instead of offering a test send", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...emptyManifest(),
      configuredSlots: configuredSlotsOf({}),
    });
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.goto("mailer");

    await expect(page.getByTestId("mailer-not-configured")).toBeVisible();
    await expect(page.getByTestId("mailer-test-submit")).toHaveCount(0);
  });

  test("an admin sends a test message from the Mailer page", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...emptyManifest(),
      configuredSlots: MAILER_CONFIGURED,
    });
    const sends = await mockRpcWithCapture(page, {
      captureSuffix: "/auth/mailer/testSend",
      captureResponse: { ok: true },
      handlers: { "/auth/session": AUTHED_ADMIN },
    });
    await page.goto("mailer");
    await page.getByTestId("mailer-test-recipient").fill("ops@example.test");

    await page.getByTestId("mailer-test-submit").click();

    await expect(page.getByTestId("mailer-test-feedback")).toContainText(
      "ops@example.test",
    );
    expect(sends).toEqual([{ to: "ops@example.test" }]);
  });

  test("a deployment refusing email delivery sends /mailer home", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...emptyManifest(),
      configuredSlots: MAILER_CONFIGURED,
      refusedAdminAreas: ["emailDelivery"],
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.goto("mailer");

    await expect(page.getByTestId("dashboard-welcome-heading")).toBeVisible();
    await expect(page.getByTestId("mailer-heading")).toHaveCount(0);
  });
});
