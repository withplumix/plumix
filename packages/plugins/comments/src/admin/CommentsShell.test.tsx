import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CommentsShell } from "./CommentsShell.js";

interface CapturedCall {
  readonly proc: string;
  readonly body: { json?: { id?: number } } | undefined;
}

let calls: CapturedCall[];

function mockRpc(handlers: Record<string, unknown>): void {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const proc = url.replace("/_plumix/rpc/comments/", "");
    const bodyStr = typeof init?.body === "string" ? init.body : null;
    calls.push({
      proc,
      body: bodyStr ? (JSON.parse(bodyStr) as CapturedCall["body"]) : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ json: handlers[proc] ?? {}, meta: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderShell(): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommentsShell />
    </QueryClientProvider>,
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

beforeEach(() => {
  calls = [];
});
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
      expect(calls.some((c) => c.proc === "approve")).toBe(true);
    });
    expect(calls.find((c) => c.proc === "approve")?.body?.json?.id).toBe(1);
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
});
