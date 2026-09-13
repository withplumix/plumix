import type { JsonValue } from "plumix";
import type { PluginRpcStub } from "plumix/admin/test";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { stubPluginRpc } from "plumix/admin/test";
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CommentsShell } from "./CommentsShell.js";

i18n.load({ en: {} });
i18n.activate("en");

let stub: PluginRpcStub;

function mockRpc(handlers: Record<string, JsonValue>): void {
  const responders: Record<string, () => JsonValue> = {};
  for (const [procedure, value] of Object.entries(handlers)) {
    responders[procedure] = () => value;
  }
  stub = stubPluginRpc("comments", responders);
}

function inputOf<T>(procedure: string): T | undefined {
  return stub.lastCallTo(procedure)?.input as T | undefined;
}

function renderShell(): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <CommentsShell />
      </QueryClientProvider>
    </I18nProvider>,
  ).container as unknown as ReactElement;
}

const ROW = {
  id: 1,
  entryId: 7,
  parentId: null,
  status: "pending",
  authorName: "Ada Lovelace",
  authorEmail: "ada@example.test",
  bodyMd: "hello world",
  ipHash: "abc123",
  userAgent: null,
  createdAt: "2026-06-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommentsShell", () => {
  test("renders status tabs with counts", async () => {
    mockRpc({
      counts: { pending: 3, approved: 8, spam: 1, trash: 0 },
      list: [],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comments-count-pending")).toHaveTextContent(
        "3",
      );
    });
    expect(screen.getByTestId("comments-count-approved")).toHaveTextContent(
      "8",
    );
  });

  test("renders the pending queue rows", async () => {
    mockRpc({
      counts: { pending: 1, approved: 0, spam: 0, trash: 0 },
      list: [ROW],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comment-row-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("comment-excerpt-1")).toHaveTextContent(
      "hello world",
    );
  });

  test("approving a row posts to the approve procedure", async () => {
    mockRpc({
      counts: { pending: 1, approved: 0, spam: 0, trash: 0 },
      list: [ROW],
      approve: { status: "approved" },
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comment-approve-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("comment-approve-1"));
    await waitFor(() => {
      expect(stub.lastCallTo("approve")).toBeDefined();
    });
    expect(inputOf<{ id: number }>("approve")?.id).toBe(1);
  });

  test("opening a row reveals the detail panel with private context", async () => {
    mockRpc({
      counts: { pending: 1, approved: 0, spam: 0, trash: 0 },
      list: [ROW],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comment-open-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("comment-open-1"));
    expect(screen.getByTestId("comment-detail-email")).toHaveTextContent(
      "ada@example.test",
    );
    expect(screen.getByTestId("comment-detail-ip")).toHaveTextContent("abc123");
  });

  test("shows an empty state when a tab has no comments", async () => {
    mockRpc({
      counts: { pending: 0, approved: 0, spam: 0, trash: 0 },
      list: [],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comments-empty")).toBeInTheDocument();
    });
  });

  test("selecting rows reveals the bulk bar and bulk-approves", async () => {
    const row2 = { ...ROW, id: 2, authorName: "Bob" };
    mockRpc({
      counts: { pending: 2, approved: 0, spam: 0, trash: 0 },
      list: [ROW, row2],
      bulk: { changed: 2 },
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comment-select-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("comment-select-1"));
    fireEvent.click(screen.getByTestId("comment-select-2"));
    expect(screen.getByTestId("comments-bulk-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByTestId("comments-bulk-approve"));
    await waitFor(() => {
      expect(stub.lastCallTo("bulk")).toBeDefined();
    });
    const bulkInput = inputOf<{ ids: number[]; action: string }>("bulk");
    expect(bulkInput?.ids).toEqual([1, 2]);
    expect(bulkInput?.action).toBe("approve");
  });

  test("renders a page-level heading", async () => {
    mockRpc({
      counts: { pending: 0, approved: 0, spam: 0, trash: 0 },
      list: [],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comments-heading")).toBeInTheDocument();
    });
    expect(screen.getByTestId("comments-heading").tagName).toBe("H1");
  });

  test("filter inputs carry visible placeholders", async () => {
    mockRpc({
      counts: { pending: 0, approved: 0, spam: 0, trash: 0 },
      list: [],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comments-search")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("comments-search").getAttribute("placeholder"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("comments-entry-filter").getAttribute("placeholder"),
    ).toBeTruthy();
  });

  test("typing in the search box refetches with the term", async () => {
    mockRpc({
      counts: { pending: 0, approved: 0, spam: 0, trash: 0 },
      list: [],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("comments-search")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("comments-search"), {
      target: { value: "ada" },
    });
    await waitFor(() => {
      expect(inputOf<{ search?: string }>("list")?.search).toBe("ada");
    });
  });
});
