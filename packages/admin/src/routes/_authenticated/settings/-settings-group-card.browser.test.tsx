import { Suspense } from "react";
import { createQueryClient } from "@/providers/query-client.js";
import { ORPCError } from "@orpc/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SettingsGroupManifestEntry } from "@plumix/core/manifest";

import { renderWithRouter } from "../../../../test/render-with-router.js";
import { stubRpc } from "../../../../test/rpc.js";
import { SettingsGroupCard } from "./-settings-group-card.js";

const identity: SettingsGroupManifestEntry = {
  name: "identity",
  label: "Identity",
  fields: [
    {
      key: "site_title",
      label: "Site title",
      type: "string",
      inputType: "text",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SettingsGroupCard", () => {
  test("shows the localized save failure for a rejection it has no reason for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRpc({
      "settings/get": () => ({}),
      "settings/upsert": () => {
        throw new ORPCError("FORBIDDEN");
      },
    });
    await renderWithRouter(
      <QueryClientProvider client={createQueryClient()}>
        <Suspense>
          <SettingsGroupCard group={identity} />
        </Suspense>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId("settings-submit-identity"));

    expect(
      await screen.findByTestId("settings-server-error-identity"),
    ).toHaveTextContent("Couldn't save settings.");
  });
});
