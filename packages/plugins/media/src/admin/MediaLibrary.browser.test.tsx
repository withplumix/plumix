import type { PluginRpcStub } from "plumix/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { i18n, I18nProvider } from "plumix/i18n";
import { PluginRpcError, stubPluginRpc } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { MediaLibraryProps } from "./MediaLibrary.js";
import { MediaLibrary } from "./MediaLibrary.js";

i18n.load({ en: {} });
i18n.activate("en");

const MODES = ["page", "picker"] as const;

let stub: PluginRpcStub;

beforeEach(() => {
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
  vi.restoreAllMocks();
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

// The upload PUT goes through XMLHttpRequest for its progress events, so the
// browser boundary is stubbed here rather than fetch.
function stubPutStatus(status: number): void {
  class FakeXhr {
    status = 0;
    readonly upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readonly open = vi.fn();
    readonly setRequestHeader = vi.fn();
    send(): void {
      this.status = status;
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

// Returns whether the page claimed the drop (`preventDefault`).
function dropFile(): boolean {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File(["x"], "cat.png", { type: "image/png" }));
  const drop = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    dataTransfer,
  });
  return !screen.getByTestId("media-library").dispatchEvent(drop);
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

    test("a missing storage adapter explains itself in the banner", async () => {
      stub = stubPluginRpc("media", {
        list: () => ({ items: [], hasMore: false }),
        createUploadUrl: () => {
          throw new PluginRpcError("CONFLICT", {
            status: 409,
            data: { reason: "storage_not_configured" },
          });
        },
      });
      renderLibrary(mode);
      await screen.findByTestId("media-library-dropzone");

      dropFile();

      expect(
        await screen.findByTestId("media-library-banner-error"),
      ).toHaveTextContent(
        "No storage adapter is wired up — set `storage:` in plumix.config.ts.",
      );
    });

    test("a PUT refused as too large says the file exceeds the cap", async () => {
      stub = stubPluginRpc("media", {
        list: () => ({ items: [], hasMore: false }),
        createUploadUrl: () => ({
          uploadUrl: "https://bucket.example/upload",
          method: "PUT",
          headers: {},
          mediaId: 7,
          storageKey: "cat.png",
          expiresAt: 0,
        }),
        delete: () => ({ id: 7 }),
      });
      stubPutStatus(413);
      renderLibrary(mode);
      await screen.findByTestId("media-library-dropzone");

      dropFile();

      expect(
        await screen.findByTestId("media-library-banner-error"),
      ).toHaveTextContent("File exceeds the configured maxUploadSize.");
    });

    test("an unmapped failure shows the generic copy", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      renderLibrary(mode);
      await screen.findByTestId("media-library-dropzone");

      dropFile();

      expect(
        await screen.findByTestId("media-library-banner-error"),
      ).toHaveTextContent("Something went wrong. Try again.");
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
