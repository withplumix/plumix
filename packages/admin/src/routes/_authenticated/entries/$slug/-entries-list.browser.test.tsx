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

describe("entries list", () => {
  test("a failed load shows the entry type's localized load-failed copy", async () => {
    seedManifest({
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
          labels: {
            loadErrorItems: {
              id: "test.post.loadErrorItems",
              message: "Couldn't load posts. Try again.",
            },
          },
        },
      ],
    });
    stubRpc({
      "entry/list": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderRoute(Route, {
      path: "/entries/$slug/",
      url: "/entries/posts",
      capabilities: ["entry:post:read"],
    });

    expect(
      await screen.findByTestId("content-list-load-error"),
    ).toHaveTextContent("Couldn't load posts. Try again.");
  });
});
