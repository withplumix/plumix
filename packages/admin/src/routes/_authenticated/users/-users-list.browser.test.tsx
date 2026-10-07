import { ORPCError } from "@orpc/client";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderRoute } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("users list", () => {
  test("a failed load shows the localized load-failed copy", async () => {
    stubRpc({
      "user/list": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderRoute(Route, {
      path: "/users/",
      url: "/users",
      capabilities: ["user:list"],
    });

    expect(
      await screen.findByTestId("users-list-load-error"),
    ).toHaveTextContent("Couldn't load users. Try again.");
  });

  test("offers the invite action to a user who may create users", async () => {
    stubRpc({ "user/list": () => [] });
    await renderRoute(Route, {
      path: "/users/",
      url: "/users",
      capabilities: ["user:list", "user:create"],
    });

    expect(await screen.findByTestId("users-list-invite-button")).toBeVisible();
    expect(await screen.findByTestId("users-list-empty-invite")).toBeVisible();
  });

  test("offers no invite action where the deployment refuses email delivery", async () => {
    seedManifest({ refusedAdminAreas: ["emailDelivery"] });
    stubRpc({ "user/list": () => [] });
    await renderRoute(Route, {
      path: "/users/",
      url: "/users",
      capabilities: ["user:list", "user:create"],
    });

    await screen.findByTestId("users-list-empty-state");
    expect(screen.queryByTestId("users-list-invite-button")).toBeNull();
    expect(screen.queryByTestId("users-list-empty-invite")).toBeNull();
  });
});
