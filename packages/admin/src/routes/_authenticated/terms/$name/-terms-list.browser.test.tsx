import { ORPCError } from "@orpc/client";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../../test/manifest.js";
import { renderRoute } from "../../../../../test/render-with-router.js";
import { stubRpc } from "../../../../../test/rpc.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("terms list", () => {
  test("a failed load shows the taxonomy's localized load-failed copy", async () => {
    seedManifest({
      termTaxonomies: [
        {
          name: "category",
          label: "Categories",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          labels: {
            loadErrorItems: {
              id: "test.category.loadErrorItems",
              message: "Couldn't load categories. Try again.",
            },
          },
        },
      ],
    });
    stubRpc({
      "term/list": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderRoute(Route, {
      path: "/terms/$name/",
      url: "/terms/category",
      capabilities: ["term:category:read"],
    });

    expect(
      await screen.findByTestId("taxonomy-list-load-error"),
    ).toHaveTextContent("Couldn't load categories. Try again.");
  });
});
