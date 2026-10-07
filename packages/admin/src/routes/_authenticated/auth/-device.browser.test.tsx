import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderRoute } from "../../../../test/render-with-router.js";
import { Route } from "./device.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderDevice(): Promise<void> {
  await renderRoute(Route, {
    path: "/auth/device",
    url: "/auth/device",
    capabilities: [],
  });
}

describe("device authorization", () => {
  test("asks for the code the device shows", async () => {
    await renderDevice();

    expect(
      await screen.findByTestId("auth-device-usercode-input"),
    ).toBeVisible();
  });

  test("sends a visitor away where the deployment refuses device authorization", async () => {
    seedManifest({ refusedAdminAreas: ["deviceAuthorization"] });
    await renderDevice();

    expect(screen.queryByTestId("auth-device-heading")).toBeNull();
  });
});
