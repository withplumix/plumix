import type { Mock } from "vitest";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "plumix/blocks";
import { afterEach, describe, expect, test, vi } from "vitest";

import { postSubmission } from "./wire.js";

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
