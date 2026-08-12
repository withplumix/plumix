import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useAuth } from "./use-auth.js";

function sessionResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/** Stubs `fetch` to settle with `response` and returns the mock for assertions. */
function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.replaceChildren();
});

describe("useAuth", () => {
  test("starts in a loading state with no user before the fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((): Promise<Response> => new Promise(() => undefined)),
    );
    const { result } = renderHook(() => useAuth());
    expect(result.current).toEqual({ user: null, loading: true });
  });

  test("resolves the signed-in visitor from auth.session", async () => {
    const user = {
      id: 7,
      email: "reader@example.test",
      name: "Reader",
      avatarUrl: null,
      role: "subscriber",
      capabilities: ["entry:post:read", "user:edit_own"],
    };
    stubFetch(sessionResponse({ json: { user, needsBootstrap: false } }));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(user);
  });

  test("calls the shared auth.session endpoint with the CSRF header and RPC body", async () => {
    const fetchMock = stubFetch(
      sessionResponse({ json: { user: null, needsBootstrap: false } }),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/_plumix/rpc/auth/session");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-plumix-request")).toBe("1");
    expect(init.body).toBe(JSON.stringify({ json: {} }));
  });

  test("prefixes the subdirectory base path from the islands bootstrap marker", async () => {
    const script = document.createElement("script");
    script.dataset.plumixBasePath = "/blog";
    document.head.append(script);
    const fetchMock = stubFetch(
      sessionResponse({ json: { user: null, needsBootstrap: false } }),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/blog/_plumix/rpc/auth/session");
  });

  test("resolves the signed-out state cleanly as a null user", async () => {
    stubFetch(sessionResponse({ json: { user: null, needsBootstrap: false } }));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  test("fails closed to a signed-out state when the request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((): Promise<Response> => Promise.reject(new Error("offline"))),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  test("fails closed when the endpoint returns a non-2xx response", async () => {
    stubFetch(sessionResponse({}, { status: 500 }));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });
});
