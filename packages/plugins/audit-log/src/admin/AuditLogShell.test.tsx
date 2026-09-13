import type { JsonValue } from "plumix";
import type { PluginRpcStub } from "plumix/admin/test";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubPluginRpc } from "plumix/admin/test";
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogShell } from "./AuditLogShell.js";

i18n.load({ en: {} });
i18n.activate("en");

// These tests drive real Radix Select + text-filter interactions through
// userEvent; under heavily-parallel CI the 5s default testTimeout is too tight
// (they pass everywhere but a loaded runner takes ~5s just for the clicks).
vi.setConfig({ testTimeout: 20_000 });

let stub: PluginRpcStub;

function mockListPages(
  responses: readonly {
    rows: readonly Record<string, unknown>[];
    nextCursor?: string | null;
  }[],
): void {
  let idx = 0;
  stub = stubPluginRpc("audit_log", {
    list: (): JsonValue => {
      const reply = responses[Math.min(idx, responses.length - 1)] ?? {
        rows: [],
        nextCursor: null,
      };
      idx += 1;
      return {
        rows: reply.rows as JsonValue,
        nextCursor: reply.nextCursor ?? null,
      };
    },
  });
}

function renderShell(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return (
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nProvider>
    );
  }
  render(<AuditLogShell />, { wrapper: Wrapper });
}

describe("AuditLogShell", () => {
  beforeEach(() => {
    // URL-state lives in window.location.search; isolate each test from
    // bleed-over by resetting the URL to a clean baseline path. Without
    // this, a filter set in one test would re-hydrate in the next.
    window.history.replaceState(null, "", "/pages/audit-log");
  });

  afterEach(async () => {
    // Flush a trailing query re-render before unmounting so cleanup() doesn't
    // unmount mid-render (React's "synchronously unmount a root while rendering"
    // warning). This quiets console noise; it is not the flake fix.
    await act(async () => {
      await Promise.resolve();
    });
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

    const user = userEvent.setup();
    await user.click(screen.getByTestId("audit-log-filter-subject-type"));
    await user.click(screen.getByTestId("audit-log-filter-subject-type-user"));
    await user.click(screen.getByTestId("audit-log-filter-event-prefix"));
    await user.click(screen.getByTestId("audit-log-filter-event-prefix-user:"));
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

    const user = userEvent.setup();
    await user.click(screen.getByTestId("audit-log-filter-subject-type"));
    await user.click(screen.getByTestId("audit-log-filter-subject-type-user"));
    await waitFor(() => {
      expect(lastJson()?.subjectType).toBe("user");
    });

    fireEvent.click(screen.getByTestId("audit-log-filter-reset"));

    await waitFor(() => {
      expect(lastJson()?.subjectType).toBeUndefined();
    });
  });

  test("URL search params hydrate the initial filter state on mount", async () => {
    window.history.replaceState(
      null,
      "",
      "/pages/audit-log?eventPrefix=user%3A&actorId=7&subjectType=user&preset=last7",
    );
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();

    await screen.findByTestId("audit-log-empty");

    const json = lastJson();
    expect(json).toMatchObject({
      eventPrefix: "user:",
      actorId: 7,
      subjectType: "user",
    });
    // The preset translates to an occurredAfter epoch — we don't pin the
    // exact value (depends on `now`), but it must be set, which proves the
    // preset survived the URL round-trip.
    expect(typeof json?.occurredAfter).toBe("number");

    expect(
      screen.getByTestId("audit-log-filter-event-prefix"),
    ).toHaveTextContent("user:");
    expect(
      screen.getByTestId<HTMLInputElement>("audit-log-filter-actor").value,
    ).toBe("7");
  });

  test("changing a filter updates the URL search params", async () => {
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();
    await screen.findByTestId("audit-log-empty");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("audit-log-filter-event-prefix"));
    await user.click(screen.getByTestId("audit-log-filter-event-prefix-user:"));

    await waitFor(() => {
      expect(window.location.search).toContain("eventPrefix=user");
    });
  });

  test("reset clears the URL search params", async () => {
    window.history.replaceState(
      null,
      "",
      "/pages/audit-log?eventPrefix=user%3A",
    );
    mockListPages([{ rows: [], nextCursor: null }]);
    renderShell();
    await screen.findByTestId("audit-log-empty");

    fireEvent.click(screen.getByTestId("audit-log-filter-reset"));

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });
});

function lastJson(): Record<string, unknown> | undefined {
  const input = stub.lastCallTo("list")?.input;
  if (typeof input !== "object" || input === null) return undefined;
  return input as Record<string, unknown>;
}
