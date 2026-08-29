import type { Mock } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface FetchStub {
  /** The stub as it stands for the test now running. */
  current(): Mock<Fetch>;
  /** What the endpoint answers with from here on. */
  answering(body: unknown, status?: number): void;
}

/**
 * The endpoint, stubbed, for the two browser surfaces that post to it —
 * the island over the plugin's markup and the hook over a theme's own.
 * Replaced before each test and unstubbed after, so a suite never
 * inherits the last test's answer.
 */
export function stubFetch(): FetchStub {
  let mock = vi.fn<Fetch>();
  beforeEach(() => {
    mock = vi.fn<Fetch>(() =>
      Promise.resolve(jsonResponse({ status: "approved" })),
    );
    vi.stubGlobal("fetch", mock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  return {
    current: () => mock,
    answering: (body, status = 200) => {
      mock.mockImplementation(() =>
        Promise.resolve(jsonResponse(body, status)),
      );
    },
  };
}
