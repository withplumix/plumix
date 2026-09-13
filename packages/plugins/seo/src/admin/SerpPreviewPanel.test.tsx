import type { JsonValue } from "plumix";
import type { PluginRpcStub } from "plumix/admin/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { stubPluginRpc } from "plumix/admin/test";
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SerpOverrides, SerpPreview } from "../serp.js";
import { SerpPreviewPanel } from "./SerpPreviewPanel.js";

i18n.load({ en: {} });
i18n.activate("en");

const PREVIEW: SerpPreview = {
  url: "https://cms.example/post/hello",
  title: "Hello",
  description: "My excerpt",
  indexable: true,
  reason: "default",
};

const NOTHING: SerpOverrides = {
  title: null,
  description: null,
  noindex: false,
};

let stub: PluginRpcStub;

function mockRpc(reply: SerpPreview): void {
  stub = stubPluginRpc("seo", {
    // Safety: `SerpPreview` is plain data — every field is already a
    // JSON-representable primitive or literal union.
    preview: () => reply as unknown as JsonValue,
  });
}

function renderPanel(
  overrides: SerpOverrides = NOTHING,
  entryId: number | null = 7,
): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <SerpPreviewPanel
          entryId={entryId}
          overrides={overrides}
          disabled={false}
          testId="preview"
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SerpPreviewPanel", () => {
  test("shows the resolved result — url, title and description", async () => {
    mockRpc(PREVIEW);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-title")).toHaveTextContent("Hello");
    });
    expect(screen.getByTestId("preview-url")).toHaveTextContent(
      "https://cms.example/post/hello",
    );
    expect(screen.getByTestId("preview-description")).toHaveTextContent(
      "My excerpt",
    );
  });

  test("an unsaved search title and description are what the preview shows", async () => {
    mockRpc(PREVIEW);
    renderPanel({
      title: "A different headline",
      description: "A different snippet",
      noindex: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("preview-title")).toHaveTextContent(
        "A different headline",
      );
    });
    expect(screen.getByTestId("preview-description")).toHaveTextContent(
      "A different snippet",
    );
  });

  test("both lines are counted against the length a search engine keeps", async () => {
    mockRpc(PREVIEW);
    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByTestId("preview-title-length-count"),
      ).toHaveTextContent("5 / 60");
    });
    expect(
      screen.getByTestId("preview-description-length-count"),
    ).toHaveTextContent("10 / 155");
    expect(screen.getByTestId("preview-title-length-state")).toHaveTextContent(
      "Fits.",
    );
  });

  test("a title past the limit says it will be cut short", async () => {
    mockRpc(PREVIEW);
    renderPanel({ ...NOTHING, title: "x".repeat(61) });

    await waitFor(() => {
      expect(
        screen.getByTestId("preview-title-length-count"),
      ).toHaveTextContent("61 / 60");
    });
    expect(screen.getByTestId("preview-title-length-state")).toHaveTextContent(
      "cut it short",
    );
  });

  test("an entry the author has just hidden says so in words", async () => {
    mockRpc(PREVIEW);
    renderPanel({ ...NOTHING, noindex: true });

    await waitFor(() => {
      expect(screen.getByTestId("preview-excluded")).toHaveTextContent(
        "Hidden from search engines on this entry.",
      );
    });
  });

  test("a private site is named as the reason rather than the entry", async () => {
    mockRpc({ ...PREVIEW, indexable: false, reason: "site_private" });
    renderPanel({ ...NOTHING, noindex: true });

    await waitFor(() => {
      expect(screen.getByTestId("preview-excluded")).toHaveTextContent(
        "The whole site is held out of search.",
      );
    });
  });

  test("a type held out of search names the settings screen", async () => {
    mockRpc({ ...PREVIEW, indexable: false, reason: "type_default" });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-excluded")).toHaveTextContent(
        "This content type is held out of search in settings.",
      );
    });
  });

  test("an indexable page says nothing about exclusion", async () => {
    mockRpc(PREVIEW);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-title")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("preview-excluded")).toBeNull();
  });

  test("asks for nothing on the create form, where there is no entry yet", () => {
    mockRpc(PREVIEW);
    renderPanel(NOTHING, null);

    expect(screen.getByTestId("preview")).toHaveTextContent(
      "Save the entry to see how it will look in search results.",
    );
    expect(stub.calls).toHaveLength(0);
  });
});
