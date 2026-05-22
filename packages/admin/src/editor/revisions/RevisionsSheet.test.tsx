import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("RevisionsSheet — Builder-style tabs (#289 slice 1)", () => {
  test("renders three tabs (All / Publishes / Autosaves) when open", async () => {
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() => Promise.resolve({ revisions: [], nextCursor: null })}
          relativeTime={() => "now"}
          fetchRevision={vi.fn()}
          fetchCurrent={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("revisions-tab-all")).toBeInTheDocument();
    });
    expect(screen.getByTestId("revisions-tab-publishes")).toBeInTheDocument();
    expect(screen.getByTestId("revisions-tab-autosaves")).toBeInTheDocument();
  });

  test("switching to the Autosaves tab shows the empty-state stub, not the row list", async () => {
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() =>
            Promise.resolve({
              revisions: [
                {
                  id: 9,
                  title: "Snap",
                  updatedAt: new Date("2026-05-22T00:00:00Z"),
                  authorId: 1,
                  authorName: "Ada",
                  authorEmail: "ada@x",
                },
              ] satisfies RevisionFixture[],
              nextCursor: null,
            })
          }
          relativeTime={() => "now"}
          fetchRevision={vi.fn()}
          fetchCurrent={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("revisions-tab-autosaves")).toBeInTheDocument();
    });
    // Wait for the row to render under the default All tab so we know
    // data loaded before we switch tabs.
    await waitFor(() => {
      expect(screen.getByTestId("revisions-sheet-item-9")).toBeInTheDocument();
    });
    await userEvent
      .setup()
      .click(screen.getByTestId("revisions-tab-autosaves"));
    await waitFor(() => {
      expect(
        screen.getByTestId("revisions-autosaves-empty"),
      ).toBeInTheDocument();
    });
  });

  test("dialog does not fetch before the user clicks the diff icon", async () => {
    const fetchRevision = vi.fn();
    const fetchCurrent = vi.fn();
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() =>
            Promise.resolve({
              revisions: [
                {
                  id: 17,
                  title: "Snap",
                  updatedAt: new Date("2026-05-22T00:00:00Z"),
                  authorId: 1,
                  authorName: "Ada",
                  authorEmail: "ada@x",
                },
              ] satisfies RevisionFixture[],
              nextCursor: null,
            })
          }
          relativeTime={() => "now"}
          fetchRevision={fetchRevision}
          fetchCurrent={fetchCurrent}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-17-diff"));
    // The sheet is open and rows are rendered, but no row has been
    // clicked — neither snapshot fetcher should have fired.
    expect(fetchRevision).not.toHaveBeenCalled();
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  test("closing the sheet also closes an open diff modal", async () => {
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() =>
            Promise.resolve({
              revisions: [
                {
                  id: 11,
                  title: "Snap",
                  updatedAt: new Date("2026-05-22T00:00:00Z"),
                  authorId: 1,
                  authorName: "Ada",
                  authorEmail: "ada@x",
                },
              ] satisfies RevisionFixture[],
              nextCursor: null,
            })
          }
          relativeTime={() => "now"}
          fetchRevision={() =>
            Promise.resolve({
              title: "T",
              slug: "t",
              excerpt: null,
              content: {},
              meta: {},
            })
          }
          fetchCurrent={() =>
            Promise.resolve({
              title: "T",
              slug: "t",
              excerpt: null,
              content: {},
              meta: {},
            })
          }
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-11-diff"));
    fireEvent.click(screen.getByTestId("revisions-sheet-item-11-diff"));
    await waitFor(() =>
      expect(screen.getByTestId("revision-diff-modal")).toBeInTheDocument(),
    );
    // Esc closes the sheet — both the sheet panel and the diff modal
    // must unmount, otherwise an orphan modal sits on a hidden sheet.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByTestId("revision-diff-modal"),
      ).not.toBeInTheDocument();
    });
  });

  test("modal surfaces an error state when snapshot fetch fails", async () => {
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() =>
            Promise.resolve({
              revisions: [
                {
                  id: 13,
                  title: "Snap",
                  updatedAt: new Date("2026-05-22T00:00:00Z"),
                  authorId: 1,
                  authorName: "Ada",
                  authorEmail: "ada@x",
                },
              ] satisfies RevisionFixture[],
              nextCursor: null,
            })
          }
          relativeTime={() => "now"}
          fetchRevision={() => Promise.reject(new Error("boom"))}
          fetchCurrent={() => Promise.reject(new Error("boom"))}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-13-diff"));
    fireEvent.click(screen.getByTestId("revisions-sheet-item-13-diff"));
    await waitFor(() => {
      expect(
        screen.getAllByTestId("revision-diff-modal-error").length,
      ).toBeGreaterThan(0);
    });
  });

  test("per-row code-diff icon opens a modal with both JSON snapshots", async () => {
    const revision = {
      title: "Was",
      slug: "was",
      excerpt: null,
      content: { blocks: [{ id: "a", name: "core/heading", attrs: {} }] },
      meta: {},
    };
    const current = {
      title: "Now",
      slug: "now",
      excerpt: null,
      content: { blocks: [{ id: "a", name: "core/rich-text", attrs: {} }] },
      meta: {},
    };
    render(
      wrap(
        <RevisionsSheet
          entryId={1}
          fetchPage={() =>
            Promise.resolve({
              revisions: [
                {
                  id: 42,
                  title: "Snap",
                  updatedAt: new Date("2026-05-22T00:00:00Z"),
                  authorId: 1,
                  authorName: "Ada",
                  authorEmail: "ada@x",
                },
              ] satisfies RevisionFixture[],
              nextCursor: null,
            })
          }
          relativeTime={() => "now"}
          fetchRevision={() => Promise.resolve(revision)}
          fetchCurrent={() => Promise.resolve(current)}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => {
      expect(
        screen.getByTestId("revisions-sheet-item-42-diff"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("revisions-sheet-item-42-diff"));
    await waitFor(() => {
      expect(screen.getByTestId("revision-diff-modal").textContent).toContain(
        "core/heading",
      );
    });
    expect(screen.getByTestId("revision-diff-modal").textContent).toContain(
      "core/rich-text",
    );
  });
});

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

  test("restore button calls onRestore and closes the sheet", async () => {
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
    const onRestore = vi.fn(() => Promise.resolve());
    render(
      wrap(
        <RevisionsSheet
          entryId={42}
          fetchPage={fetchPage}
          relativeTime={() => "now"}
          fetchRevision={() =>
            Promise.resolve({
              title: "S",
              slug: "s",
              excerpt: null,
              content: { type: "doc", content: [] },
              meta: {},
            })
          }
          fetchCurrent={() =>
            Promise.resolve({
              title: "S v2",
              slug: "s",
              excerpt: null,
              content: { type: "doc", content: [] },
              meta: {},
            })
          }
          onRestore={onRestore}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("revisions-sheet-trigger"));
    await waitFor(() => screen.getByTestId("revisions-sheet-item-8-select"));
    fireEvent.click(screen.getByTestId("revisions-sheet-item-8-select"));
    await waitFor(() => screen.getByTestId("revisions-sheet-diff"));
    fireEvent.click(screen.getByTestId("revisions-sheet-restore"));
    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(8);
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("revisions-sheet-diff"),
      ).not.toBeInTheDocument();
    });
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
