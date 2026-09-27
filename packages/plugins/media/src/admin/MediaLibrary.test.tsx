import type { PluginRpcStub } from "plumix/admin/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PluginRpcError, stubPluginRpc } from "plumix/admin/test";
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { MediaLibraryProps } from "./MediaLibrary.js";
import { MediaLibrary } from "./MediaLibrary.js";

i18n.load({ en: {} });
i18n.activate("en");

const MODES = ["page", "picker"] as const;

let stub: PluginRpcStub;

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://cms.example/_plumix/admin"));
  stub = stubPluginRpc("media", {
    list: () => ({ items: [], hasMore: false }),
    // Rejected so a started upload stops before the XHR PUT.
    createUploadUrl: () => {
      throw new PluginRpcError("CONFLICT", { status: 409 });
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// What the admin shell publishes on `window.plumix` from the manifest.
function seedSlots(storage: boolean): void {
  vi.stubGlobal("plumix", {
    configuredSlots: {
      storage,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: false,
    },
  });
}

function renderLibrary(mode: MediaLibraryProps["mode"]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MediaLibrary mode={mode} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

// Returns whether the page claimed the drop (`preventDefault`).
function dropFile(): boolean {
  const file = new File(["x"], "cat.png", { type: "image/png" });
  return !fireEvent.drop(screen.getByTestId("media-library"), {
    dataTransfer: { files: [file], types: ["Files"] },
  });
}

describe.each(MODES)("MediaLibrary in %s mode", (mode) => {
  describe("without a storage slot", () => {
    beforeEach(() => {
      seedSlots(false);
    });

    test("explains that uploads need a storage slot", async () => {
      renderLibrary(mode);

      expect(
        await screen.findByTestId("media-library-storage-required"),
      ).toHaveTextContent("storage:");
    });

    test("offers no upload button and no dropzone", async () => {
      renderLibrary(mode);

      await screen.findByTestId("media-library-storage-required");
      expect(screen.queryByTestId("media-library-upload")).toBeNull();
      expect(screen.queryByTestId("media-library-dropzone")).toBeNull();
    });

    test("a dropped file starts no upload", async () => {
      renderLibrary(mode);
      await screen.findByTestId("media-library-storage-required");

      expect(dropFile()).toBe(false);
      expect(screen.queryByTestId("media-library-progress")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(stub.lastCallTo("createUploadUrl")).toBeUndefined();
    });
  });

  describe("with a storage slot", () => {
    beforeEach(() => {
      seedSlots(true);
    });

    test("offers the upload button and the dropzone", async () => {
      renderLibrary(mode);

      expect(
        await screen.findByTestId("media-library-dropzone"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("media-library-upload")).toBeInTheDocument();
      expect(screen.queryByTestId("media-library-storage-required")).toBeNull();
    });

    test("a dropped file requests an upload URL", async () => {
      renderLibrary(mode);
      await screen.findByTestId("media-library-dropzone");

      expect(dropFile()).toBe(true);
      await waitFor(() => {
        expect(stub.lastCallTo("createUploadUrl")?.input).toEqual({
          filename: "cat.png",
          contentType: "image/png",
          size: 1,
        });
      });
    });
  });
});
