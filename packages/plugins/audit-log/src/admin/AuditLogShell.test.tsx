import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogShell } from "./AuditLogShell.js";

interface CapturedCall {
  readonly url: string;
  readonly body: unknown;
}

let fetchMock: ReturnType<
  typeof vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >
>;
let calls: CapturedCall[];

function mockListPages(
  responses: readonly {
    rows: readonly Record<string, unknown>[];
    nextCursor?: string | null;
  }[],
): void {
  let idx = 0;
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const bodyString = typeof init?.body === "string" ? init.body : null;
    calls.push({
      url,
      body:
        bodyString !== null ? (JSON.parse(bodyString) as unknown) : undefined,
    });
    const reply = responses[Math.min(idx, responses.length - 1)] ?? {
      rows: [],
      nextCursor: null,
    };
    idx += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          json: { rows: reply.rows, nextCursor: reply.nextCursor ?? null },
          meta: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  });
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
    calls = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders the empty-state when no audit rows match", async () => {
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();
    expect(await screen.findByTestId("audit-log-empty")).toBeInTheDocument();
  });

  test("renders one row per audit entry with event + subject labels", async () => {
    mockListPages([
      {
        rows: [
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
        ],
        nextCursor: null,
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
    const diffPreviews = screen.getAllByTestId("audit-log-diff-preview");
    expect(diffPreviews).toHaveLength(1);
    expect(diffPreviews[0]).toHaveTextContent("title");
  });

  test("filter changes generate a fresh RPC call with the filter params", async () => {
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();
    await screen.findByTestId("audit-log-empty");

    fireEvent.change(screen.getByTestId("audit-log-filter-subject-type"), {
      target: { value: "user" },
    });
    fireEvent.change(screen.getByTestId("audit-log-filter-event-prefix"), {
      target: { value: "user:" },
    });
    fireEvent.change(screen.getByTestId("audit-log-filter-actor"), {
      target: { value: "7" },
    });

    await waitFor(() => {
      const json = lastJson();
      expect(json).toMatchObject({
        subjectType: "user",
        eventPrefix: "user:",
        actorId: 7,
      });
    });
  });

  test("load more uses cursor from the last page", async () => {
    mockListPages([
      {
        rows: [
          {
            id: 1,
            occurredAt: "2026-05-10T10:00:00Z",
            event: "entry:published",
            subjectType: "entry",
            subjectId: "42",
            subjectLabel: "Hello",
            actorId: 7,
            actorLabel: "alice@example.com",
            properties: {},
          },
        ],
        nextCursor: "page-2-cursor",
      },
      {
        rows: [
          {
            id: 2,
            occurredAt: "2026-05-10T09:00:00Z",
            event: "entry:trashed",
            subjectType: "entry",
            subjectId: "43",
            subjectLabel: "Old",
            actorId: 7,
            actorLabel: "alice@example.com",
            properties: {},
          },
        ],
        nextCursor: null,
      },
    ]);
    renderShell();
    await screen.findByTestId("audit-log-row-1");

    const loadMore = await screen.findByTestId("audit-log-load-more");
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(screen.getByTestId("audit-log-row-2")).toBeInTheDocument();
    });
    expect(lastJson()?.cursor).toBe("page-2-cursor");
  });

  test("reset clears filters and triggers a fresh unfiltered fetch", async () => {
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();
    await screen.findByTestId("audit-log-empty");

    fireEvent.change(screen.getByTestId("audit-log-filter-subject-type"), {
      target: { value: "user" },
    });
    await waitFor(() => {
      expect(lastJson()?.subjectType).toBe("user");
    });

    fireEvent.click(screen.getByTestId("audit-log-filter-reset"));

    await waitFor(() => {
      expect(lastJson()?.subjectType).toBeUndefined();
    });
  });
});

function lastJson(): Record<string, unknown> | undefined {
  const last = calls[calls.length - 1];
  if (!last) return undefined;
  const body = last.body;
  if (body === undefined || body === null || typeof body !== "object") {
    return undefined;
  }
  const json = (body as { json?: unknown }).json;
  if (json === undefined || json === null || typeof json !== "object") {
    return undefined;
  }
  return json as Record<string, unknown>;
}
