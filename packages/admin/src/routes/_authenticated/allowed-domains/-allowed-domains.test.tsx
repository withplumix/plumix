import { ORPCError } from "@orpc/client";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderRoute } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("allowed domains", () => {
  test("shows the localized retry copy for a failure it has no reason for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "auth/allowedDomains/list": () => [],
      "auth/allowedDomains/create": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderRoute(Route, {
      path: "/allowed-domains/",
      url: "/allowed-domains",
      capabilities: ["settings:manage"],
    });

    fireEvent.change(screen.getByTestId("allowed-domains-domain-input"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByTestId("allowed-domains-add-button"));

    expect(
      await screen.findByTestId("allowed-domains-error"),
    ).toHaveTextContent("Couldn't save the domain. Try again.");
  });
});
