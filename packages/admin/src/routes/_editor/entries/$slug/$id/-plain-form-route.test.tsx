import { Suspense } from "react";
import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";

import {
  clearManifest,
  seedManifest,
} from "../../../../../../test/manifest.js";
import { renderWithRouter } from "../../../../../../test/render-with-router.js";
import { stubRpc } from "../../../../../../test/rpc.js";
import { PlainFormRouteInner } from "./-plain-form-route.js";

const author: EntryTypeManifestEntry = {
  name: "author",
  capabilityType: "author",
  adminSlug: "authors",
  label: "Author",
  isPublic: false,
  showUI: true,
  showInSidebar: true,
};

const entry = {
  id: 1,
  type: "author",
  parentId: null,
  title: "Jane Doe",
  slug: "jane-doe",
  content: null,
  excerpt: null,
  status: "draft",
  updatedAt: "2026-05-20T00:00:00.000Z",
  meta: { headline: "Staff writer" },
};

const headlineRejected = new ORPCError("CONFLICT", {
  message: "meta_invalid_value",
  data: {
    reason: "meta_invalid_value",
    errors: [{ path: "headline", message: "Headline is taken" }],
  },
});

beforeEach(() => {
  seedManifest({
    entryTypes: [author],
    entryMetaBoxes: [
      {
        id: "bio",
        label: "Biography",
        entryTypes: ["author"],
        fields: [
          {
            key: "headline",
            label: "Headline",
            type: "string",
            inputType: "text",
          },
        ],
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
});

async function renderRoute(): Promise<void> {
  await renderWithRouter(
    <QueryClientProvider client={createQueryClient()}>
      <Suspense>
        <PlainFormRouteInner
          entryType={author}
          id={1}
          supportsRevisions={false}
          capabilities={[]}
        />
      </Suspense>
    </QueryClientProvider>,
  );
  await screen.findByTestId("plain-form-layout");
}

describe("PlainFormRouteInner", () => {
  test("a meta rejection marks the offending input", async () => {
    stubRpc({
      "entry/get": () => entry,
      "entry/update": () => {
        throw headlineRejected;
      },
    });
    await renderRoute();

    fireEvent.click(screen.getByTestId("plain-form-save-button"));

    expect(
      (await screen.findByTestId("meta-box-field-headline-error")).textContent,
    ).toBe("Headline is taken");
    expect(screen.getByTestId("plain-form-status-pill").dataset.status).toBe(
      "error",
    );
  });

  test("a later successful save removes the pinned error", async () => {
    let rejectNext = true;
    stubRpc({
      "entry/get": () => entry,
      "entry/update": () => {
        if (rejectNext) {
          rejectNext = false;
          throw headlineRejected;
        }
        return entry;
      },
    });
    await renderRoute();

    fireEvent.click(screen.getByTestId("plain-form-save-button"));
    await screen.findByTestId("meta-box-field-headline-error");
    fireEvent.click(screen.getByTestId("plain-form-save-button"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("meta-box-field-headline-error"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("plain-form-status-pill").dataset.status).toBe(
      "saved",
    );
  });

  test("an error without field paths only flags the save status", async () => {
    stubRpc({
      "entry/get": () => entry,
      "entry/update": () => {
        throw new Error("boom");
      },
    });
    await renderRoute();

    fireEvent.click(screen.getByTestId("plain-form-save-button"));

    await waitFor(() => {
      expect(screen.getByTestId("plain-form-status-pill").dataset.status).toBe(
        "error",
      );
    });
    expect(
      screen.queryByTestId("meta-box-field-headline-error"),
    ).not.toBeInTheDocument();
  });
});
