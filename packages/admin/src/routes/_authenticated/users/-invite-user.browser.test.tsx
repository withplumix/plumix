import { ORPCError } from "@orpc/client";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../test/manifest.js";
import { renderRoute } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { Route } from "./create.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("invite user", () => {
  test("shows the localized retry copy for a failure it has no reason for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "user/invite": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderRoute(Route, {
      path: "/users/create",
      url: "/users/create",
      capabilities: ["user:create"],
    });

    fireEvent.change(screen.getByTestId("invite-email-input"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));

    expect(await screen.findByTestId("invite-server-error")).toHaveTextContent(
      "Couldn't send invite. Try again.",
    );
  });

  test("sends a visitor away where the deployment refuses email delivery", async () => {
    seedManifest({ refusedAdminAreas: ["emailDelivery"] });
    await renderRoute(Route, {
      path: "/users/create",
      url: "/users/create",
      capabilities: ["user:create"],
    });

    expect(screen.queryByTestId("invite-email-input")).toBeNull();
  });
});
