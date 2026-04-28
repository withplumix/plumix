import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "../db/schema/index.js";
import type { User } from "../db/schema/users.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";

type TestDb = LibSQLDatabase<typeof schema>;

export interface FetchOptions {
  readonly method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "HEAD"
    | "OPTIONS";
  readonly headers?: HeadersInit;
  readonly body?: BodyInit;
  /**
   * JSON body. Mutually exclusive with `body`. Sets content-type to
   * application/json and serialises via JSON.stringify. Do NOT nest an oRPC
   * envelope here — the RPC client (h.client) handles wire format itself.
   */
  readonly json?: unknown;
  /**
   * Impersonate a user. Creates a session, attaches the cookie to this
   * request. Use null (the default) for anonymous requests.
   */
  readonly as?: User | null;
  /**
   * Treat the path as a /_plumix/* request and auto-add the custom CSRF
   * header. Defaults to auto-detect based on path prefix.
   */
  readonly withCsrfHeader?: boolean;
}

const ORIGIN = "https://cms.example";

export async function buildRequest(
  db: TestDb,
  path: string,
  options: FetchOptions = {},
): Promise<Request> {
  const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
  const headers = new Headers(options.headers);

  if (options.json !== undefined) {
    if (options.body !== undefined) {
      throw new Error("buildRequest: pass either `json` or `body`, not both");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  const needsCsrf =
    options.withCsrfHeader ?? new URL(url).pathname.startsWith("/_plumix/");
  if (needsCsrf && !headers.has("x-plumix-request")) {
    headers.set("x-plumix-request", "1");
  }

  if (options.as) {
    const { token } = await createSession(db, { userId: options.as.id });
    const existing = headers.get("cookie");
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    headers.set("cookie", existing ? `${existing}; ${cookie}` : cookie);
  }

  const init: RequestInit = {
    method: options.method ?? (options.json !== undefined ? "POST" : "GET"),
    headers,
  };
  if (options.json !== undefined) {
    init.body = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    init.body = options.body;
  }
  return new Request(url, init);
}

/**
 * Wraps a Response with chainable assertion helpers. Returned from
 * harness.fetch() — callers never construct this directly.
 *
 * Surface intentionally minimal: assertions land here when a test
 * actually needs them. `deepEqual` / `partialMatch` are exported
 * from `./match.js` for body-shape checks. Earlier this class
 * shipped with `assertJson`, `assertJsonMatch`, `assertBodyContains`,
 * `assertRedirect`, `assertHeader`, `assertTemplate`, plus `raw` /
 * `status` getters — nothing called them, so they were removed
 * under the "address fallow dead-code" pass. Re-add a method when
 * you write the first test that needs it.
 */
export class TestResponse {
  readonly #response: Response;
  readonly #bodyText: Promise<string>;

  constructor(response: Response) {
    this.#response = response;
    this.#bodyText = response.clone().text();
  }

  // Surfaced for cookie / header pass-through patterns where a test
  // needs the raw header value after asserting it exists.
  get headers(): Headers {
    return this.#response.headers;
  }

  async text(): Promise<string> {
    return this.#bodyText;
  }

  async json<T = unknown>(): Promise<T> {
    const text = await this.#bodyText;
    return JSON.parse(text) as T;
  }

  assertStatus(code: number): this {
    if (this.#response.status !== code) {
      throw new Error(
        `assertStatus: expected ${code}, got ${this.#response.status}`,
      );
    }
    return this;
  }

  /**
   * Assert a Set-Cookie header was issued for the named cookie.
   */
  assertCookieSet(name: string): this {
    const set = this.#response.headers.get("set-cookie");
    if (!set?.includes(`${name}=`)) {
      throw new Error(`assertCookieSet: no Set-Cookie for "${name}"`);
    }
    return this;
  }
}
