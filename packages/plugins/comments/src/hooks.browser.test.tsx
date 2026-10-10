import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { ResolvedComment } from "./hooks.js";
import { usePlumixCommentForm, usePlumixCommentThread } from "./hooks.js";
import { jsonResponse, stubFetch } from "./test/fetch.js";
import { fetchCommentPage } from "./wire.js";

const endpoint = stubFetch();

/**
 * None of the plugin's markup: everything it knows about the submission
 * comes from the hook, which is the claim `usePlumixCommentForm` makes.
 */
function ReplyBox(): ReactNode {
  const form = usePlumixCommentForm({ entryId: 7 });
  const send = () => {
    void form.submit({
      name: "Ada",
      email: "ada@example.test",
      body: "hello",
    });
  };
  if (form.status !== null) {
    return (
      <div>
        <p data-testid="filed">{form.status}</p>
        <button data-testid="resend" type="button" onClick={send}>
          Post another
        </button>
      </div>
    );
  }
  return (
    <div>
      <button
        data-testid="send"
        type="button"
        disabled={form.submitting}
        onClick={send}
      >
        {form.submitting ? "Sending" : "Post"}
      </button>
      {form.errorFor("email") === undefined ? null : (
        <p data-testid="email-error">{form.errorFor("email")}</p>
      )}
      {form.errorFor("") === undefined ? null : (
        <p data-testid="form-error">{form.errorFor("")}</p>
      )}
    </div>
  );
}

beforeEach(() => {
  document.head.innerHTML = "";
});

afterEach(cleanup);

describe("a theme rendering its own comment controls", () => {
  test("posts to the same endpoint the rendered form posts to", async () => {
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(endpoint.current()).toHaveBeenCalledTimes(1);
    });
    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/_plumix/comments/submit",
    );
  });

  test("posts under the subdirectory the deployment is mounted at", async () => {
    document.head.innerHTML = '<script data-plumix-base-path="/blog"></script>';
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(endpoint.current().mock.calls[0]?.[0]).toBe(
        "/blog/_plumix/comments/submit",
      );
    });
  });

  test("hands back how the comment was filed, so a theme can say so", async () => {
    endpoint.answering({ status: "pending" });
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(view.getByTestId("filed").textContent).toBe("pending");
    });
  });

  test("hands back a refusal against the control it names", async () => {
    endpoint.answering({ error: "email_required" }, 400);
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(view.getByTestId("email-error").textContent).toBe(
        "An email address is required.",
      );
    });
  });

  test("does not post the same comment twice from two presses in a tick", async () => {
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));
    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(endpoint.current()).toHaveBeenCalledTimes(1);
    });
  });

  test("clears a status a later refusal has replaced", async () => {
    const view = render(<ReplyBox />);
    fireEvent.click(view.getByTestId("send"));
    await waitFor(() => {
      expect(view.getByTestId("filed").textContent).toBe("approved");
    });

    // A theme that keeps its controls mounted must not show last time's
    // outcome beside this time's refusals.
    endpoint.answering({ error: "rate_limited" }, 429);
    fireEvent.click(view.getByTestId("resend"));

    await waitFor(() => {
      expect(view.getByTestId("form-error").textContent).toContain(
        "Too many comments",
      );
    });
  });

  test("reads a submission that never landed back through the empty field", async () => {
    endpoint
      .current()
      .mockImplementation(() => Promise.reject(new Error("offline")));
    const view = render(<ReplyBox />);

    fireEvent.click(view.getByTestId("send"));

    await waitFor(() => {
      expect(view.getByTestId("form-error").textContent).toContain(
        "could not be sent",
      );
    });
  });
});

/** A theme's own "load more", rendering everything the hook hands back. */
function OlderComments({ cursor }: { readonly cursor: string | null }) {
  const thread = usePlumixCommentThread({ entryId: 7, cursor });
  return (
    <div>
      <ul data-testid="more">
        {thread.comments.map((comment) => (
          <li key={comment.id} data-testid={`more-${String(comment.id)}`}>
            {comment.createdAt.toISOString()}
          </li>
        ))}
      </ul>
      {thread.hasMore ? (
        <button
          data-testid="load-more"
          type="button"
          disabled={thread.loading}
          onClick={() => void thread.loadMore()}
        >
          More
        </button>
      ) : null}
      {thread.error === null ? null : (
        <p data-testid="load-error">{thread.error}</p>
      )}
    </div>
  );
}

describe("a theme loading older comments", () => {
  test("asks for the page after the cursor it was handed", async () => {
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(endpoint.current().mock.calls[0]?.[0]).toBe(
        "/_plumix/comments/list?entryId=7&cursor=100_3",
      );
    });
  });

  test("asks under the subdirectory the deployment is mounted at", async () => {
    document.head.innerHTML = '<script data-plumix-base-path="/blog"></script>';
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(endpoint.current().mock.calls[0]?.[0]).toBe(
        "/blog/_plumix/comments/list?entryId=7&cursor=100_3",
      );
    });
  });

  test("leaves the cursor off when there is none to send", async () => {
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });

    await fetchCommentPage(7, null);

    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/_plumix/comments/list?entryId=7",
    );
  });

  test("hands back every comment and reply with a real Date", async () => {
    endpoint.answering(
      page([
        wireComment(4, "2026-06-04T00:00:00.000Z", [
          wireComment(5, "2026-06-05T00:00:00.000Z", [
            wireComment(6, "2026-06-06T00:00:00.000Z"),
          ]),
        ]),
      ]),
    );

    const answer = await fetchCommentPage(7, "100_3");

    expect(answer.ok).toBe(true);
    const dates = answer.ok ? everyCreatedAt(answer.comments) : [];
    expect(dates).toHaveLength(3);
    for (const date of dates) expect(date).toBeInstanceOf(Date);
    expect(dates.map((date) => date.toISOString())).toEqual([
      "2026-06-04T00:00:00.000Z",
      "2026-06-05T00:00:00.000Z",
      "2026-06-06T00:00:00.000Z",
    ]);
  });

  test("appends a second page, asked for with the first page's cursor", async () => {
    endpoint
      .current()
      .mockResolvedValueOnce(
        jsonResponse(page([wireComment(3)], { nextCursor: "50_2" })),
      )
      .mockResolvedValueOnce(jsonResponse(page([wireComment(2)])));
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));
    await waitFor(() => {
      expect(view.getByTestId("more-3")).toBeTruthy();
    });
    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("more-2")).toBeTruthy();
    });
    expect(view.getByTestId("more-3")).toBeTruthy();
    expect(endpoint.current().mock.calls[1]?.[0]).toBe(
      "/_plumix/comments/list?entryId=7&cursor=50_2",
    );
  });

  test("stops asking once a page says there are no more", async () => {
    endpoint.answering(page([wireComment(3)], { hasMore: false }));
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("more-3")).toBeTruthy();
    });
    expect(view.queryByTestId("load-more")).toBeNull();
  });

  test("makes no request from loadMore once there are no more", async () => {
    const { result } = renderHook(() =>
      usePlumixCommentThread({ entryId: 7, cursor: null }),
    );

    await act(() => result.current.loadMore());

    expect(endpoint.current()).not.toHaveBeenCalled();
  });

  test("names the refusal the route answered with", async () => {
    endpoint.answering({ error: "comments_disabled" }, 403);
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("load-error").textContent).toBe(
        "Comments are not open here.",
      );
    });
  });

  test("says the comments could not be loaded when the network fails", async () => {
    endpoint
      .current()
      .mockImplementation(() => Promise.reject(new Error("offline")));
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("load-error").textContent).toBe(
        "Those comments could not be loaded. Please try again.",
      );
    });
  });

  test("says the comments could not be loaded when the payload is not a page", async () => {
    endpoint.answering(page([{ ...wireComment(3), createdAt: "yesterday" }]));
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("load-error").textContent).toBe(
        "Those comments could not be loaded. Please try again.",
      );
    });
  });

  test("retries the page that failed", async () => {
    endpoint
      .current()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(page([wireComment(3)])));
    const view = render(<OlderComments cursor="100_3" />);

    fireEvent.click(view.getByTestId("load-more"));
    await waitFor(() => {
      expect(view.getByTestId("load-error")).toBeTruthy();
    });
    fireEvent.click(view.getByTestId("load-more"));

    await waitFor(() => {
      expect(view.getByTestId("more-3")).toBeTruthy();
    });
    expect(view.queryByTestId("load-error")).toBeNull();
    expect(endpoint.current().mock.calls.map((call) => call[0])).toEqual([
      "/_plumix/comments/list?entryId=7&cursor=100_3",
      "/_plumix/comments/list?entryId=7&cursor=100_3",
    ]);
  });

  test("does not ask for one page twice from two calls in a tick", async () => {
    endpoint.answering(page([wireComment(3)]));
    const { result } = renderHook(() =>
      usePlumixCommentThread({ entryId: 7, cursor: "100_3" }),
    );
    const thread = result.current;

    // Both calls read the render before either has landed, so neither the
    // `loading` flag nor a disabled button can be what keeps the second out.
    await act(() => Promise.all([thread.loadMore(), thread.loadMore()]));

    expect(endpoint.current()).toHaveBeenCalledTimes(1);
    expect(result.current.comments).toHaveLength(1);
  });
});

interface WireComment {
  readonly id: number;
  readonly authorName: string;
  readonly isRegistered: boolean;
  readonly avatarUrl: string;
  readonly bodyHtml: string;
  readonly createdAt: string;
  readonly replies: readonly WireComment[];
}

/** One comment as the list route serializes it. */
function wireComment(
  id: number,
  createdAt = "2026-06-01T00:00:00.000Z",
  replies: readonly WireComment[] = [],
): WireComment {
  return {
    id,
    authorName: "Ada",
    isRegistered: false,
    avatarUrl: "https://gravatar.test/avatar",
    bodyHtml: "<p>hello</p>",
    createdAt,
    replies,
  };
}

function page(
  comments: readonly WireComment[],
  more: { readonly hasMore?: boolean; readonly nextCursor?: string } = {},
) {
  const nextCursor = more.nextCursor ?? null;
  return {
    comments,
    hasMore: more.hasMore ?? nextCursor !== null,
    nextCursor,
  };
}

function everyCreatedAt(comments: readonly ResolvedComment[]): Date[] {
  return comments.flatMap((comment) => [
    comment.createdAt,
    ...everyCreatedAt(comment.replies),
  ]);
}
