import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchSessionUser, useAuth } from "./use-auth.js";

interface SentRequest {
  readonly url: RequestInfo | URL;
  readonly init: RequestInit;
}

/** A `fetch` that answers every request with `response` and records it. */
function answering(response: Response): {
  readonly fetch: typeof fetch;
  readonly sent: SentRequest[];
} {
  const sent: SentRequest[] = [];
  return {
    sent,
    fetch: (input, init = {}) => {
      sent.push({ url: input, init });
      return Promise.resolve(response);
    },
  };
}

function signedOut(): Response {
  return Response.json({ json: { user: null, needsBootstrap: false } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  test("the module carries no `use client` directive", () => {
    // A directive would make the island transform shim `useAuth` into a
    // component. The transform accepts one below leading comments, so strip
    // those rather than anchoring at byte zero.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "use-auth.ts"), "utf8");
    const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    expect(body).not.toMatch(/^["']use client["']/);
  });

  test("starts in a loading state with no user before the probe resolves", () => {
    function State(): ReactNode {
      return JSON.stringify(useAuth());
    }

    expect(renderToStaticMarkup(h(State))).toBe(
      "{&quot;user&quot;:null,&quot;loading&quot;:true}",
    );
  });

  test("does not probe the session during a server render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    function Greeting(): ReactNode {
      const { user, loading } = useAuth();
      return h("span", null, loading ? "loading" : (user?.email ?? "out"));
    }

    // The server render is cache-shared and anonymous: it renders the loading
    // branch and the probe waits for hydration.
    expect(renderToStaticMarkup(h(Greeting))).toBe("<span>loading</span>");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchSessionUser", () => {
  test("posts the RPC body to auth.session with the CSRF header", async () => {
    const server = answering(signedOut());

    await fetchSessionUser("", new AbortController().signal, server.fetch);

    expect(server.sent).toHaveLength(1);
    const [{ url, init }] = server.sent as [SentRequest];
    expect(url).toBe("/_plumix/rpc/auth/session");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-plumix-request")).toBe("1");
    expect(init.body).toBe('{"json":{}}');
  });

  test("prefixes a subdirectory base path to the endpoint", async () => {
    const server = answering(signedOut());

    await fetchSessionUser("/blog", new AbortController().signal, server.fetch);

    expect(server.sent.map(({ url }) => url)).toEqual([
      "/blog/_plumix/rpc/auth/session",
    ]);
  });

  test("fails closed to signed out when the request errors", async () => {
    const offline: typeof fetch = () => Promise.reject(new Error("offline"));

    await expect(
      fetchSessionUser("", new AbortController().signal, offline),
    ).resolves.toBeNull();
  });

  test("fails closed to signed out on a non-2xx response", async () => {
    const server = answering(
      Response.json({ json: { user: { id: 1 } } }, { status: 500 }),
    );

    await expect(
      fetchSessionUser("", new AbortController().signal, server.fetch),
    ).resolves.toBeNull();
  });
});
