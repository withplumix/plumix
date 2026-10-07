import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { configuredSlotsOf } from "@plumix/core/manifest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderRoute } from "../../../../test/render-with-router.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mailer = { ...configuredSlotsOf({}), mailer: true };

async function renderMailer(): Promise<void> {
  await renderRoute(Route, {
    path: "/mailer/",
    url: "/mailer",
    capabilities: ["settings:manage"],
  });
}

describe("mailer route", () => {
  test("shows the Mailer page to a user who may manage settings", async () => {
    seedManifest({ configuredSlots: mailer });
    await renderMailer();

    expect(await screen.findByTestId("mailer-heading")).toBeVisible();
  });

  test("sends a visitor away where the deployment refuses email delivery", async () => {
    seedManifest({
      configuredSlots: mailer,
      refusedAdminAreas: ["emailDelivery"],
    });
    await renderMailer();

    expect(screen.queryByTestId("mailer-heading")).toBeNull();
  });
});
