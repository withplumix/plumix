import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogShell } from "./AuditLogShell.js";

let fetchMock: ReturnType<
  typeof vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >
>;

function mockListResponse(rows: readonly Record<string, unknown>[]): void {
  fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ json: { rows }, meta: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
}

function renderShell(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<AuditLogShell />, { wrapper: Wrapper });
}

describe("AuditLogShell", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders the empty-state when no audit rows have been recorded", async () => {
    mockListResponse([]);
    renderShell();
    expect(await screen.findByTestId("audit-log-empty")).toBeInTheDocument();
  });

  test("renders one row per audit entry with event + subject labels", async () => {
    mockListResponse([
      {
        id: 1,
        occurredAt: "2026-05-10T10:00:00Z",
        event: "entry:published",
        subjectType: "entry",
        subjectId: "42",
        subjectLabel: "Hello world",
        actorId: 7,
        actorLabel: "alice@example.com",
        properties: {},
      },
      {
        id: 2,
        occurredAt: "2026-05-10T10:01:00Z",
        event: "entry:updated",
        subjectType: "entry",
        subjectId: "42",
        subjectLabel: "Hello world",
        actorId: 7,
        actorLabel: "alice@example.com",
        properties: { diff: { title: ["Hello", "Hello world"] } },
      },
    ]);
    renderShell();

    expect(await screen.findByTestId("audit-log-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("audit-log-event-1")).toHaveTextContent(
      "entry:published",
    );
    expect(screen.getByTestId("audit-log-subject-1")).toHaveTextContent(
      "Hello world",
    );
    // Diff preview surfaces only when there's a `diff` envelope.
    const diffPreviews = screen.getAllByTestId("audit-log-diff-preview");
    expect(diffPreviews).toHaveLength(1);
    expect(diffPreviews[0]).toHaveTextContent("title");
  });
});
