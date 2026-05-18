import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RevisionsSheet } from "./RevisionsSheet.js";

afterEach(() => {
  cleanup();
});

interface RevisionFixture {
  readonly id: number;
  readonly title: string;
  readonly updatedAt: Date;
  readonly authorId: number;
  readonly authorName: string | null;
  readonly authorEmail: string | null;
}

function wrap(child: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{child}</QueryClientProvider>;
}

describe("RevisionsSheet", () => {
  test("renders nothing in the DOM tree before the trigger opens it", () => {
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={vi.fn()}
          relativeTime={(d) => d.toISOString()}
          fetchRevision={vi.fn()}
          fetchCurrent={vi.fn()}
        />,
      ),
    );
    // Sheet trigger button is present, but the panel itself isn't.
    expect(screen.getByTestId("revisions-sheet-trigger")).toBeInTheDocument();
    expect(
      screen.queryByTestId("revisions-sheet-list"),
    ).not.toBeInTheDocument();
  });

  test("clicking the trigger opens the sheet and fetches the first page", async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({
        revisions: [
          {
            id: 7,
            title: "Snapshot Two",
            updatedAt: new Date("2026-05-17T12:00:00Z"),
            authorId: 1,
            authorName: "Ada",
            authorEmail: "ada@example.test",
          },
          {
            id: 6,
            title: "Snapshot One",
            updatedAt: new Date("2026-05-17T11:00:00Z"),
            authorId: 1,
            authorName: "Ada",
            authorEmail: "ada@example.test",
          },
        ] satisfies RevisionFixture[],
        nextCursor: null,
      }),
    );
    render(
      wrap(
        <RevisionsSheet
          entryId={42}
          fetchPage={fetchPage}
          relativeTime={() => "just now"}
          fetchRevision={vi.fn()}
          fetchCurrent={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("revisions-sheet-list")).toBeInTheDocument();
    });
    expect(fetchPage).toHaveBeenCalledWith({
      entryId: 42,
      cursor: null,
    });
    const item7 = screen.getByTestId("revisions-sheet-item-7");
    const item6 = screen.getByTestId("revisions-sheet-item-6");
    expect(item7.textContent).toContain("Snapshot Two");
    expect(item7.textContent).toContain("Ada");
    expect(item7.textContent).toContain("just now");
    expect(item6.textContent).toContain("Snapshot One");
    expect(item6.textContent).toContain("Ada");
  });

  test("Load more fetches the next page using the previous cursor", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        revisions: [
          {
            id: 7,
            title: "First page",
            updatedAt: new Date("2026-05-17T12:00:00Z"),
            authorId: 1,
            authorName: "Ada",
            authorEmail: "ada@x",
          },
        ],
        nextCursor: "cur-1",
      })
      .mockResolvedValueOnce({
        revisions: [
          {
            id: 6,
            title: "Second page",
            updatedAt: new Date("2026-05-17T11:00:00Z"),
            authorId: 1,
            authorName: "Ada",
            authorEmail: "ada@x",
          },
        ],
        nextCursor: null,
      });
    render(
      wrap(
        <RevisionsSheet
          entryId={42}
          fetchPage={fetchPage}
          relativeTime={() => "now"}
          fetchRevision={vi.fn()}
          fetchCurrent={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-7"));
    fireEvent.click(screen.getByTestId("revisions-sheet-load-more"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-6"));
    expect(fetchPage).toHaveBeenLastCalledWith({
      entryId: 42,
      cursor: "cur-1",
    });
    expect(
      screen.queryByTestId("revisions-sheet-load-more"),
    ).not.toBeInTheDocument();
  });

  test("selecting a revision opens the diff panel and fetches both snapshots", async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({
        revisions: [
          {
            id: 8,
            title: "Snapshot",
            updatedAt: new Date("2026-05-17T12:00:00Z"),
            authorId: 1,
            authorName: "Ada",
            authorEmail: "ada@x",
          },
        ] satisfies RevisionFixture[],
        nextCursor: null,
      }),
    );
    const fetchRevision = vi.fn(() =>
      Promise.resolve({
        title: "Snapshot",
        slug: "post",
        excerpt: null,
        content: { type: "doc", content: [] },
        meta: {},
      }),
    );
    const fetchCurrent = vi.fn(() =>
      Promise.resolve({
        title: "Snapshot v2",
        slug: "post",
        excerpt: null,
        content: { type: "doc", content: [] },
        meta: {},
      }),
    );
    render(
      wrap(
        <RevisionsSheet
          entryId={42}
          fetchPage={fetchPage}
          relativeTime={() => "now"}
          fetchRevision={fetchRevision}
          fetchCurrent={fetchCurrent}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-8-select"));
    fireEvent.click(screen.getByTestId("revisions-sheet-item-8-select"));
    await waitFor(() => screen.getByTestId("revisions-sheet-diff"));
    expect(fetchRevision).toHaveBeenCalledWith(8);
    expect(fetchCurrent).toHaveBeenCalledWith(42);
    // The diff renders the title field diff (Snapshot vs Snapshot v2).
    expect(screen.getByTestId("revision-diff-field-title")).toBeInTheDocument();
    // Back button returns to the list.
    fireEvent.click(screen.getByTestId("revisions-sheet-back"));
    await waitFor(() => screen.getByTestId("revisions-sheet-list"));
  });
});
