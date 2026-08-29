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
import { i18n, I18nProvider } from "plumix/i18n";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SubmissionsShell } from "./SubmissionsShell.js";

i18n.load({ en: {} });
i18n.activate("en");

// Radix Select interactions go through userEvent, which is slow enough
// on a loaded CI runner to outlast the 5s default.
vi.setConfig({ testTimeout: 20_000 });

interface CapturedCall {
  readonly procedure: string;
  readonly input: Record<string, unknown>;
}

let calls: CapturedCall[];

const CONTACT_ROW = {
  id: 7,
  form: "contact",
  status: "new",
  answers: { name: "Ada", email: "ada@example.test" },
  labels: { name: { label: "Your name" }, email: { label: "Email" } },
  entryId: 42,
  ipHash: "deadbeef",
  userAgent: "curl/8",
  handlerError: null,
  note: null,
  createdAt: "2026-06-01T10:00:00.000Z",
};

const RETIRED_ROW = {
  ...CONTACT_ROW,
  id: 8,
  form: "retired",
  answers: { question: "Still readable" },
  labels: { question: { label: "What we used to ask" } },
  entryId: null,
  handlerError: "SMTP refused",
};

interface Replies {
  readonly definitions?: unknown;
  readonly counts?: unknown;
  readonly list?: readonly unknown[];
  readonly get?: unknown;
  readonly setStatus?: unknown;
  readonly setNote?: unknown;
  readonly remove?: unknown;
}

function isFailure(reply: unknown): reply is { failure: string } {
  return (
    typeof reply === "object" &&
    reply !== null &&
    "failure" in reply &&
    typeof reply.failure === "string"
  );
}

function stubRpc(replies: Replies): void {
  const pages = [...(replies.list ?? [])];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const procedure = url.replace(/^.*\/_plumix\/rpc\/forms\//, "");
      const body = typeof init?.body === "string" ? init.body : "{}";
      const parsed = JSON.parse(body) as { json?: Record<string, unknown> };
      calls.push({ procedure, input: parsed.json ?? {} });
      const reply =
        procedure === "list"
          ? (pages.shift() ?? { submissions: [], nextCursor: null })
          : ((replies as Record<string, unknown>)[procedure] ?? {});
      // A reply naming a `failure` is answered the way the server answers
      // a refusal, so the page meets the same envelope it meets in
      // production rather than a shape only this file produces.
      const failure = isFailure(reply) ? reply.failure : null;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            json: failure === null ? reply : { message: failure },
            meta: [],
          }),
          {
            status: failure === null ? 200 : 400,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }),
  );
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
  render(<SubmissionsShell />, { wrapper: Wrapper });
}

function inputsFor(procedure: string): Record<string, unknown>[] {
  return calls
    .filter((call) => call.procedure === procedure)
    .map((call) => call.input);
}

function stubInbox(replies: Replies = {}): void {
  stubRpc({
    definitions: DEFAULT_DEFINITIONS,
    counts: DEFAULT_COUNTS,
    ...replies,
  });
}

/** Render, wait for the row, and open its detail panel. */
async function openDetail(id: number): Promise<void> {
  renderShell();
  await waitFor(() => {
    expect(screen.getByTestId(`forms-open-${String(id)}`)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId(`forms-open-${String(id)}`));
  await waitFor(() => {
    expect(screen.getByTestId("forms-detail")).toBeInTheDocument();
  });
}

const DEFAULT_COUNTS = {
  statuses: { new: 2, read: 1, archived: 0, spam: 3 },
  forms: { contact: 5, retired: 1 },
};

const DEFAULT_DEFINITIONS = [{ slug: "contact", title: "Contact us" }];

beforeEach(() => {
  calls = [];
});

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
  });
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubmissionsShell", () => {
  test("lists submissions under columns read from their own label snapshot", async () => {
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
    });
    renderShell();

    await waitFor(() => {
      expect(screen.getByTestId("forms-submission-row-7")).toBeInTheDocument();
    });
    expect(screen.getByTestId("forms-column-name")).toHaveTextContent(
      "Your name",
    );
    expect(screen.getByTestId("forms-cell-7-name")).toHaveTextContent("Ada");
    expect(screen.getByTestId("forms-cell-7-email")).toHaveTextContent(
      "ada@example.test",
    );
  });

  test("renders a submission whose form is gone under the labels it was given", async () => {
    const user = userEvent.setup();
    stubInbox({
      list: [{ submissions: [RETIRED_ROW], nextCursor: null }],
    });
    renderShell();

    await waitFor(() => {
      expect(screen.getByTestId("forms-submission-row-8")).toBeInTheDocument();
    });
    expect(screen.getByTestId("forms-column-question")).toHaveTextContent(
      "What we used to ask",
    );
    expect(screen.getByTestId("forms-cell-8-question")).toHaveTextContent(
      "Still readable",
    );
    // The registry does not name it, but its backlog is still reachable.
    await user.click(screen.getByTestId("forms-form-filter"));
    expect(screen.getByTestId("forms-form-filter-retired")).toBeInTheDocument();
  });

  test("shows a count beside every status and every form", async () => {
    const user = userEvent.setup();
    stubInbox({
      list: [{ submissions: [], nextCursor: null }],
    });
    renderShell();

    await waitFor(() => {
      expect(screen.getByTestId("forms-status-count-new")).toHaveTextContent(
        "2",
      );
    });
    expect(screen.getByTestId("forms-status-count-spam")).toHaveTextContent(
      "3",
    );

    await user.click(screen.getByTestId("forms-form-filter"));

    expect(screen.getByTestId("forms-form-count-contact")).toHaveTextContent(
      "5",
    );
  });

  test("filtering by status asks for that status", async () => {
    stubInbox({
      list: [{ submissions: [], nextCursor: null }],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("forms-status-tab-spam")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("forms-status-tab-spam"));

    await waitFor(() => {
      expect(inputsFor("list").some((input) => input.status === "spam")).toBe(
        true,
      );
    });
    expect(inputsFor("counts").some((input) => input.status === "spam")).toBe(
      true,
    );
  });

  test("filtering by form asks for that form", async () => {
    const user = userEvent.setup();
    stubInbox({
      list: [{ submissions: [], nextCursor: null }],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("forms-form-filter")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("forms-form-filter"));
    await user.click(screen.getByTestId("forms-form-filter-contact"));

    await waitFor(() => {
      expect(inputsFor("list").some((input) => input.form === "contact")).toBe(
        true,
      );
    });
  });

  test("asks for the next page with the cursor the last one returned", async () => {
    stubInbox({
      list: [
        { submissions: [CONTACT_ROW], nextCursor: "7" },
        { submissions: [RETIRED_ROW], nextCursor: null },
      ],
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("forms-load-more")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("forms-load-more"));

    await waitFor(() => {
      expect(screen.getByTestId("forms-submission-row-8")).toBeInTheDocument();
    });
    expect(inputsFor("list").some((input) => input.cursor === "7")).toBe(true);
  });

  test("opening a submission shows its answers, envelope and handler failure", async () => {
    stubInbox({
      list: [{ submissions: [RETIRED_ROW], nextCursor: null }],
      get: RETIRED_ROW,
    });

    await openDetail(8);

    expect(screen.getByTestId("forms-answer-question")).toHaveTextContent(
      "What we used to ask",
    );
    expect(screen.getByTestId("forms-answer-question")).toHaveTextContent(
      "Still readable",
    );
    expect(screen.getByTestId("forms-detail-ip")).toHaveTextContent("deadbeef");
    expect(screen.getByTestId("forms-detail-agent")).toHaveTextContent(
      "curl/8",
    );
    expect(screen.getByTestId("forms-detail-handler-error")).toHaveTextContent(
      "SMTP refused",
    );
  });

  test("marks a submission read, archived or spam", async () => {
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
      get: CONTACT_ROW,
      setStatus: { status: "archived" },
    });
    await openDetail(7);

    fireEvent.click(screen.getByTestId("forms-detail-status-archived"));

    await waitFor(() => {
      expect(inputsFor("setStatus")).toEqual([{ id: 7, status: "archived" }]);
    });
  });

  test("keeps a private note against a submission", async () => {
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
      get: CONTACT_ROW,
      setNote: { note: "Rang back Tuesday" },
    });
    await openDetail(7);

    fireEvent.change(screen.getByTestId("forms-detail-note"), {
      target: { value: "Rang back Tuesday" },
    });
    fireEvent.click(screen.getByTestId("forms-detail-note-save"));

    await waitFor(() => {
      expect(inputsFor("setNote")).toEqual([
        { id: 7, note: "Rang back Tuesday" },
      ]);
    });
  });

  test("asks before deleting, then deletes and closes the detail behind it", async () => {
    const user = userEvent.setup();
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
      get: CONTACT_ROW,
      remove: { deleted: true },
    });
    await openDetail(7);

    await user.click(screen.getByTestId("forms-detail-delete"));
    // The click on the button itself deletes nothing.
    expect(inputsFor("remove")).toEqual([]);

    await user.click(screen.getByTestId("forms-detail-delete-confirm"));

    await waitFor(() => {
      expect(inputsFor("remove")).toEqual([{ id: 7 }]);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("forms-detail")).not.toBeInTheDocument();
    });
  });

  test("says so when a write does not go through", async () => {
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
      get: CONTACT_ROW,
      setStatus: { failure: "archive_failed" },
    });
    await openDetail(7);

    fireEvent.click(screen.getByTestId("forms-detail-status-archived"));

    await waitFor(() => {
      expect(screen.getByTestId("forms-detail-write-error")).toHaveTextContent(
        "archive_failed",
      );
    });
  });

  test("says so when the submission is no longer there", async () => {
    stubInbox({
      list: [{ submissions: [CONTACT_ROW], nextCursor: null }],
      get: { failure: "not_found" },
    });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("forms-open-7")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("forms-open-7"));

    await waitFor(() => {
      expect(screen.getByTestId("forms-detail-gone")).toBeInTheDocument();
    });
  });

  test("marks a submission whose handler failed as failed in the list", async () => {
    stubInbox({ list: [{ submissions: [RETIRED_ROW], nextCursor: null }] });
    renderShell();

    await waitFor(() => {
      expect(screen.getByTestId("forms-failed-8")).toBeInTheDocument();
    });
  });

  test("says so when nothing has come in", async () => {
    stubInbox({
      counts: {
        statuses: { new: 0, read: 0, archived: 0, spam: 0 },
        forms: {},
      },
      list: [{ submissions: [], nextCursor: null }],
    });
    renderShell();

    await waitFor(() => {
      expect(screen.getByTestId("forms-submissions-empty")).toBeInTheDocument();
    });
  });
});

describe("exporting what the filters name", () => {
  test("links to both formats, and carries the active filter", async () => {
    const user = userEvent.setup();
    stubInbox({ list: [{ submissions: [CONTACT_ROW], nextCursor: null }] });
    renderShell();
    await waitFor(() => {
      expect(screen.getByTestId("forms-export-csv")).toBeInTheDocument();
    });

    expect(screen.getByTestId("forms-export-csv")).toHaveAttribute(
      "href",
      "/_plumix/forms/export?format=csv",
    );
    await user.click(screen.getByTestId("forms-status-tab-spam"));

    await waitFor(() => {
      expect(screen.getByTestId("forms-export-json")).toHaveAttribute(
        "href",
        "/_plumix/forms/export?format=json&status=spam",
      );
    });
  });
});
