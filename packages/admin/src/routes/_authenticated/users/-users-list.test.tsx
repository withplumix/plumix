import { ORPCError } from "@orpc/client";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderRoute } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
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
});
