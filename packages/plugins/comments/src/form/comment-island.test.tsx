import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { stubFetch } from "../test/fetch.js";
import { CommentIsland } from "./comment-island.js";

const endpoint = stubFetch();

function draw() {
  const view = render(
    <CommentIsland
      action="/_plumix/comments/submit"
      entryId={7}
      parentId={null}
      returnTo={undefined}
      idBase="c"
      requireEmail
    />,
  );
  const form = view.container.querySelector("form");
  if (form === null) throw new Error("the island rendered no form");
  const control = (name: string): HTMLElement => {
    const found = form.querySelector<HTMLElement>(
      `[data-plumix-comment-control="${name}"]`,
    );
    if (found === null) throw new Error(`no ${name} control`);
    return found;
  };
  fireEvent.change(control("name"), { target: { value: "Ada" } });
  fireEvent.change(control("email"), { target: { value: "ada@example.test" } });
  fireEvent.change(control("body"), { target: { value: "hello" } });
  return { ...view, form };
}

/**
 * The body the island posted. It has to be a string — that is what makes
 * the request JSON, which is what the endpoint negotiates the answer's
 * shape on — so anything else is the failure rather than something to
 * coerce.
 */
function posted(): unknown {
  const body = endpoint.current().mock.calls.at(-1)?.[1]?.body;
  if (typeof body !== "string") {
    expect.unreachable("the island posted something other than a JSON body");
  }
  return JSON.parse(body);
}

afterEach(cleanup);

describe("the island over the form the server already sent", () => {
  test("renders the same markup, so nothing is replaced on hydration", () => {
    const { form } = draw();

    expect(form.getAttribute("action")).toBe("/_plumix/comments/submit");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector('[name="entryId"]')).not.toBeNull();
    expect(form.querySelector("[data-plumix-comment-honeypot]")).not.toBeNull();
  });

  test("posts the comment as JSON rather than leaving the page", async () => {
    const { form } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(endpoint.current()).toHaveBeenCalledTimes(1);
    });
    expect(posted()).toEqual({
      entryId: 7,
      parentId: null,
      name: "Ada",
      email: "ada@example.test",
      body: "hello",
    });
  });

  test("sends the header a plain form cannot, so the session survives", async () => {
    const { form } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(endpoint.current()).toHaveBeenCalledTimes(1);
    });
    const headers = endpoint.current().mock.calls[0]?.[1]?.headers;
    expect(headers).toMatchObject({ "X-Plumix-Request": "1" });
  });

  test("says a comment was posted", async () => {
    const { form, container } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-comment-confirmation]")
          ?.textContent,
      ).toContain("has been posted");
    });
  });

  test("says a held comment was held, which the redirect cannot", async () => {
    endpoint.answering({ status: "pending" });
    const { form, container } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-comment-confirmation]")
          ?.textContent,
      ).toContain("sent for review");
    });
  });

  test("tells a comment filed as spam nothing a held one is not told", async () => {
    endpoint.answering({ status: "spam" });
    const { form, container } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-comment-confirmation]")
          ?.textContent,
      ).toContain("sent for review");
    });
  });

  test("renders a refusal against the control it names", async () => {
    endpoint.answering({ error: "email_required" }, 400);
    const { form, container } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector('[data-plumix-comment-error="email"]')
          ?.textContent,
      ).toBe("An email address is required.");
    });
    expect(container.querySelector("form")).not.toBeNull();
  });

  test("keeps a refusal it does not recognise out of the field errors", async () => {
    endpoint.answering({ error: "something_new" }, 500);
    const { form, container } = draw();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        container.querySelector("[data-plumix-comment-summary]")?.textContent,
      ).toContain("could not be sent");
    });
  });

  test("does not post the same comment twice from two presses in a tick", async () => {
    const { form } = draw();

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(endpoint.current()).toHaveBeenCalledTimes(1);
    });
  });
});
