// @vitest-environment jsdom
/// <reference lib="dom" />
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { email, text, toggle } from "plumix/fields";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defineForm, toFormWire } from "./define-form.js";
import { usePlumixForm } from "./headless.js";

const subscribe = defineForm("subscribe", {
  fields: [
    email("email").required(),
    text("name"),
    toggle("weekly").default(true),
  ],
});

const wire = toFormWire(subscribe);

/**
 * A theme's own subscribe bar: its own markup, its own controls, none of
 * the plugin's. Everything it knows about the form comes back from the
 * hook, which is the whole claim the headless surface makes.
 */
function SubscribeBar(): ReactNode {
  const form = usePlumixForm<typeof subscribe>(wire);
  if (form.confirmation !== null) {
    return <p data-testid="confirmed">{form.confirmation}</p>;
  }
  return (
    <div>
      <ul data-testid="fields">
        {form.fields.map((field) => (
          <li key={field.key} data-testid={`field-${field.key}`} />
        ))}
      </ul>
      <button
        data-testid="send"
        type="button"
        disabled={form.submitting}
        onClick={() => {
          void form.submit({ email: "ada@example.test", weekly: false });
        }}
      >
        {form.submitting ? "Sending" : "Subscribe"}
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

/**
 * A theme that does not wire `submitting` to its button — the hook hands
 * the state over, and nothing makes a theme use it.
 */
function EagerBar(): ReactNode {
  const form = usePlumixForm<typeof subscribe>(wire);
  if (form.confirmation !== null) {
    return <p data-testid="confirmed">{form.confirmation}</p>;
  }
  return (
    <button
      data-testid="send"
      type="button"
      onClick={() => {
        void form.submit({ email: "ada@example.test", weekly: false });
      }}
    >
      Subscribe
    </button>
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const isToken = (input: string): boolean => input.endsWith("/token");

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

type FetchMock = Mock<Fetch>;

let fetchMock: FetchMock;

/** The last submit the hook made, as the `[url, init]` it passed `fetch`. */
function lastSubmit(): readonly [string, RequestInit] {
  const last = fetchMock.mock.calls.filter((call) => !isToken(call[0])).at(-1);
  if (!last?.[1]) throw new Error("the hook made no submit request");
  return [last[0], last[1]];
}

/**
 * The answers the hook posted. It has to be a `URLSearchParams` — that is
 * what makes the request urlencoded, exactly as the rendered form posts
 * it — so anything else is the failure rather than something to coerce.
 */
function submittedBody(): URLSearchParams {
  const body = lastSubmit()[1].body;
  if (!(body instanceof URLSearchParams)) {
    throw new Error("the hook posted something other than a form body");
  }
  return body;
}

function bootstrap(basePath: string): void {
  document.head.innerHTML = `<script data-plumix-base-path="${basePath}"></script>`;
}

beforeEach(() => {
  bootstrap("");
  fetchMock = vi.fn<Fetch>((input) =>
    Promise.resolve(
      isToken(input)
        ? json({ token: "t-1" })
        : json({ ok: true, message: "Thanks." }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

describe("usePlumixForm", () => {
  test("hands the theme the form's own fields", async () => {
    render(<SubscribeBar />);

    await waitFor(() => {
      expect(screen.getByTestId("field-email")).toBeDefined();
    });
    expect(screen.getByTestId("field-name")).toBeDefined();
    expect(screen.getByTestId("field-weekly")).toBeDefined();
  });

  test("posts the answers as the body the rendered form would have posted", async () => {
    render(<SubscribeBar />);

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed").textContent).toBe("Thanks.");
    });
    const [url, init] = lastSubmit();
    expect(url).toBe("/_plumix/forms/submit");
    expect(init.method).toBe("POST");
    const body = submittedBody();
    expect(body.get("__plumix_form")).toBe("subscribe");
    expect(body.get("email")).toBe("ada@example.test");
    // The empty answer a checkbox posts beside itself: without it a
    // toggle switched off would read as its default, which is on.
    expect(body.getAll("weekly")).toEqual([""]);
  });

  test("carries the timing token it fetched on mount", async () => {
    render(<SubscribeBar />);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => isToken(call[0]))).toBe(true);
    });

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed")).toBeDefined();
    });
    expect(submittedBody().get("__plumix_token")).toBe("t-1");
  });

  test("submits without a token when the endpoint would not issue one", async () => {
    fetchMock.mockImplementation((input) =>
      isToken(input)
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(json({ ok: true, message: "Thanks." })),
    );
    render(<SubscribeBar />);

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed")).toBeDefined();
    });
    expect(submittedBody().has("__plumix_token")).toBe(false);
  });

  test("renders the endpoint's refusal against the field that produced it", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        isToken(input)
          ? json({ token: "t-1" })
          : json(
              {
                ok: false,
                errors: [{ field: "email", message: "We need an address." }],
              },
              422,
            ),
      ),
    );
    render(<SubscribeBar />);

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("email-error").textContent).toBe(
        "We need an address.",
      );
    });
  });

  test("names no field when the submission never reached the endpoint", async () => {
    fetchMock.mockImplementation((input) =>
      isToken(input)
        ? Promise.resolve(json({ token: "t-1" }))
        : Promise.reject(new Error("offline")),
    );
    render(<SubscribeBar />);

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("form-error").textContent).not.toBe("");
    });
  });

  test("posts under the site's base path", async () => {
    bootstrap("/blog");
    render(<SubscribeBar />);

    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed")).toBeDefined();
    });
    expect(lastSubmit()[0]).toBe("/blog/_plumix/forms/submit");
  });

  // The rendered form disables its own button while a submit is in
  // flight. A theme is handed `submitting` to do the same, but a second
  // click landing inside the same tick beats any disabling — and the cost
  // is two rows in `form_submissions` for one enquiry.
  test("makes one submission of a button pressed twice", async () => {
    render(<EagerBar />);

    fireEvent.click(screen.getByTestId("send"));
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed")).toBeDefined();
    });
    expect(
      fetchMock.mock.calls.filter((call) => !isToken(call[0])),
    ).toHaveLength(1);
  });
});
