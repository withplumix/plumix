import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CardPreview } from "../preview.js";
import { CardPreviewPanel } from "./CardPreviewPanel.js";

i18n.load({ en: {} });
i18n.activate("en");

const CARD: CardPreview = {
  outcome: "card",
  skipped: null,
  src: "data:image/png;base64,AAAA",
};

let requests: number;

/** Answers each call with the next reply, then repeats the last one. */
function mockRpc(...queued: readonly CardPreview[]): void {
  const replies = [...queued];
  requests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      requests += 1;
      const body = replies.length > 1 ? replies.shift() : replies[0];
      return Promise.resolve(
        new Response(JSON.stringify({ json: body, meta: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
}

// `entryId` is what the field reads off the editor's route; `disabled` is what
// a read-only form passes down.
function renderPanel(entryId: number | null = 7, disabled = false): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <CardPreviewPanel
          entryId={entryId}
          disabled={disabled}
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

describe("CardPreviewPanel", () => {
  test("shows the rendered card and names the link that produced it", async () => {
    mockRpc(CARD);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-image")).toHaveAttribute(
        "src",
        CARD.src,
      );
    });
    expect(screen.getByTestId("preview-outcome")).toHaveTextContent(
      "A card generated from this entry.",
    );
    expect(screen.queryByTestId("preview-skipped")).toBeNull();
  });

  test("names the featured photo and why the card stood aside", async () => {
    mockRpc({
      outcome: "featured",
      skipped: "featured-preferred",
      src: "https://media.example/hero.jpg",
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-outcome")).toHaveTextContent(
        "featured image",
      );
    });
    // The reason is the half that answers "why is my card not showing".
    expect(screen.getByTestId("preview-skipped")).toHaveTextContent(
      "steps aside for the featured image",
    );
  });

  test("says an unreachable entry is why there is no card", async () => {
    mockRpc({
      outcome: "site-default",
      skipped: "not-shareable",
      src: "https://cdn.example/default.png",
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-skipped")).toHaveTextContent(
        "not publicly reachable",
      );
    });
  });

  test("leaves the frame empty where the chain resolved to nothing", async () => {
    mockRpc({ outcome: "site-default", skipped: "no-rule", src: null });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-outcome")).toHaveTextContent(
        "site-wide default",
      );
    });
    // The line above says it; the frame does not say it twice.
    expect(screen.queryByTestId("preview-image")).toBeNull();
    expect(screen.queryByTestId("preview-status")).toBeNull();
  });

  test("asks for nothing on the create form, where there is no entry yet", () => {
    mockRpc(CARD);
    renderPanel(null);

    expect(screen.getByTestId("preview")).toHaveTextContent(
      "Save the entry to see how it will be shared.",
    );
    expect(requests).toBe(0);
  });

  test("re-renders the card on demand, since the entry moves under it", async () => {
    mockRpc(CARD, {
      outcome: "og-image",
      skipped: null,
      src: "https://media.example/share.png",
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("preview-image")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("preview-refresh"));

    await waitFor(() => {
      expect(screen.getByTestId("preview-outcome")).toHaveTextContent(
        "outranks the card",
      );
    });
    expect(requests).toBe(2);
  });

  test("offers no refresh a read-only form would honour", async () => {
    mockRpc(CARD);
    renderPanel(7, true);

    await waitFor(() => {
      expect(screen.getByTestId("preview-refresh")).toBeDisabled();
    });
  });
});
