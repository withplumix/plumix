import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearManifest, seedManifest } from "../../../../../test/manifest.js";
import { renderRoute } from "../../../../../test/render-with-router.js";
import { stubRpc } from "../../../../../test/rpc.js";
import { Route } from "./edit.js";

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jane = {
  id: 2,
  email: "jane@example.com",
  slug: "jane",
  name: "Jane",
  avatarUrl: null,
  role: "author" as const,
  meta: {},
  emailVerifiedAt: null,
  disabledAt: null,
  createdAt: new Date("2026-05-20T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
};

async function renderJane(): Promise<void> {
  stubRpc({ "user/get": () => jane });
  await renderRoute(Route, {
    path: "/users/$id/edit",
    url: "/users/2/edit",
    capabilities: ["user:list", "user:edit"],
  });
  await screen.findByTestId("user-edit-slug-input");
}

describe("user edit — author slug", () => {
  test("names the /authors/ URL the slug is used in", async () => {
    seedManifest({ frameworkRoutes: { author: true } });
    await renderJane();

    expect(screen.getByTestId("user-edit-slug-description")).toHaveTextContent(
      "under /authors/",
    );
  });

  test("keeps the slug but drops the hint where the site turned author routes off", async () => {
    seedManifest({ frameworkRoutes: { author: false } });
    await renderJane();

    expect(screen.getByTestId("user-edit-slug-input")).toHaveValue("jane");
    expect(screen.queryByTestId("user-edit-slug-description")).toBeNull();
  });
});
