import type { ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { usePlumixCommentForm } from "./hooks.js";
import { stubFetch } from "./test/fetch.js";

const endpoint = stubFetch();

/**
 * A theme's own reply box: its own markup, its own controls, none of the
 * plugin's. Everything it knows about the submission comes back from the
 * hook, which is the whole claim `usePlumixCommentForm` makes.
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
