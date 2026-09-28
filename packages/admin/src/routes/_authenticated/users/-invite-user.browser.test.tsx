import { ORPCError } from "@orpc/client";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderRoute } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { Route } from "./create.js";

afterEach(() => {
  cleanup();
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
});
