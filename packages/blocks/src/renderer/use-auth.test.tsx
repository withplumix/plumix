import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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

describe("useAuth on the server", () => {
  test("does not probe the session during a server render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    function Greeting(): ReactNode {
      const { user, loading } = useAuth();
      return <span>{loading ? "loading" : (user?.email ?? "signed out")}</span>;
    }

    // The server render is cache-shared and anonymous: it renders the loading
    // branch and the probe waits for hydration.
    expect(renderToStaticMarkup(<Greeting />)).toBe("<span>loading</span>");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("the module carries no `use client` directive", () => {
    // A directive here would make the Vite island transform replace `useAuth`
    // with a component shim, so the hook would return a React element during
    // SSR and every destructured field would read `undefined`. The transform
    // accepts a directive below leading comments, so strip those first rather
    // than anchoring at byte zero.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "use-auth.ts"), "utf8");
    const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    expect(body).not.toMatch(/^["']use client["']/);
  });
});
