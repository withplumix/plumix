import { i18n } from "@lingui/core";
import { ORPCError } from "@orpc/client";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TermTaxonomyManifestEntry } from "@plumix/core/manifest";

import { clearManifest, seedManifest } from "../../../../../test/manifest.js";
import { renderRoute } from "../../../../../test/render-with-router.js";
import { stubRpc } from "../../../../../test/rpc.js";
import { Route } from "./index.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  i18n.load({ en: {} });
  i18n.activate("en");
});

function seedCategory(description?: TermTaxonomyManifestEntry["description"]) {
  seedManifest({
    termTaxonomies: [
      {
        name: "category",
        label: "Categories",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        ...(description === undefined ? {} : { description }),
      },
    ],
  });
  stubRpc({ "term/list": () => [] });
}

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

  test("a descriptor description renders its translation under the heading", async () => {
    i18n.load({
      de: { "test.category.description": "Oberste Gliederung der Beiträge" },
    });
    i18n.activate("de");
    seedCategory({
      id: "test.category.description",
      message: "Top-level organisation for posts",
    });
    await renderRoute(Route, {
      path: "/terms/$name/",
      url: "/terms/category",
      capabilities: ["term:category:read"],
    });

    expect(
      await screen.findByTestId("taxonomy-list-description"),
    ).toHaveTextContent("Oberste Gliederung der Beiträge");
  });

  test("renders no description when the taxonomy sets none", async () => {
    seedCategory();
    await renderRoute(Route, {
      path: "/terms/$name/",
      url: "/terms/category",
      capabilities: ["term:category:read"],
    });

    await screen.findByTestId("taxonomy-list-heading");
    expect(
      screen.queryByTestId("taxonomy-list-description"),
    ).not.toBeInTheDocument();
  });
});
