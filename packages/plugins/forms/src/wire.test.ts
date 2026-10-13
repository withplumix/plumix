import type { Mock } from "vitest";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "plumix/blocks";
import { email, text, toggle } from "plumix/fields";
import { afterEach, describe, expect, test, vi } from "vitest";

import { defineForm, toFormWire } from "./define-form.js";
import { fetchTimingToken, postSubmission, submissionBody } from "./wire.js";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function answering(response: Promise<Response>): Mock<Fetch> {
  const fetchMock = vi.fn<Fetch>(() => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postSubmission", () => {
  test("posts the body urlencoded through the CSRF gate", async () => {
    const fetchMock = answering(
      Promise.resolve(json({ ok: true, message: "Thanks." })),
    );
    const body = new URLSearchParams({ email: "ada@example.test" });

    await postSubmission("/_plumix/forms/submit", body);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/_plumix/forms/submit");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).get(CSRF_HEADER_NAME)).toBe(
      CSRF_HEADER_VALUE,
    );
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
  });

  test("resolves to the confirmation of an accepted submission", async () => {
    answering(Promise.resolve(json({ ok: true, message: "Thanks." })));

    await expect(
      postSubmission("/submit", new URLSearchParams()),
    ).resolves.toEqual({ ok: true, message: "Thanks." });
  });

  test("resolves to the errors of a refused submission", async () => {
    const errors = [{ field: "email", message: "Try another." }];
    answering(Promise.resolve(json({ ok: false, errors })));

    await expect(
      postSubmission("/submit", new URLSearchParams()),
    ).resolves.toEqual({ ok: false, errors });
  });

  test("resolves to unreachable when the request never lands", async () => {
    answering(Promise.reject(new Error("offline")));

    await expect(
      postSubmission("/submit", new URLSearchParams()),
    ).resolves.toBe("unreachable");
  });

  test("resolves to unreachable when the answer is not JSON", async () => {
    answering(Promise.resolve(new Response("<html>captive portal</html>")));

    await expect(
      postSubmission("/submit", new URLSearchParams()),
    ).resolves.toBe("unreachable");
  });

  test("resolves to unreachable when the answer is not a submit response", async () => {
    answering(Promise.resolve(json({ token: "t-1" })));

    await expect(
      postSubmission("/submit", new URLSearchParams()),
    ).resolves.toBe("unreachable");
  });
});

const subscribe = toFormWire(
  defineForm("subscribe", {
    fields: [
      email("email").required(),
      text("name"),
      toggle("weekly").default(true),
    ],
  }),
);

describe("submissionBody", () => {
  test("names the form the answers are for", () => {
    const body = submissionBody(subscribe, { email: "ada@example.test" }, null);

    expect(body.get("__plumix_form")).toBe("subscribe");
    expect(body.get("email")).toBe("ada@example.test");
  });

  // Without the empty answer a checkbox posts beside itself, a toggle
  // switched off would read as its default, which is on.
  test("posts a toggle switched off as the rendered form would", () => {
    const body = submissionBody(
      subscribe,
      { email: "ada@example.test", weekly: false },
      null,
    );

    expect(body.getAll("weekly")).toEqual([""]);
  });

  test("carries the timing token it was handed", () => {
    const body = submissionBody(
      subscribe,
      { email: "ada@example.test" },
      "t-1",
    );

    expect(body.get("__plumix_token")).toBe("t-1");
  });

  test("submits untimed without a token", () => {
    const body = submissionBody(subscribe, { email: "ada@example.test" }, null);

    expect(body.has("__plumix_token")).toBe(false);
  });
});

describe("fetchTimingToken", () => {
  test("resolves to the token the endpoint issued", async () => {
    const fetchMock = answering(Promise.resolve(json({ token: "t-1" })));

    await expect(fetchTimingToken("/_plumix/forms/token")).resolves.toBe("t-1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/_plumix/forms/token");
  });

  test("resolves to null when the request never lands", async () => {
    answering(Promise.reject(new Error("offline")));

    await expect(fetchTimingToken("/_plumix/forms/token")).resolves.toBeNull();
  });

  test("resolves to null when the answer is not a token", async () => {
    answering(Promise.resolve(json({ ok: true, message: "Thanks." })));

    await expect(fetchTimingToken("/_plumix/forms/token")).resolves.toBeNull();
  });
});
