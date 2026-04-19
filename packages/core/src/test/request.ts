import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "../db/schema/index.js";
import type { User } from "../db/schema/users.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { deepEqual, partialMatch } from "./match.js";

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
 */
export class TestResponse {
  readonly #response: Response;
  readonly #bodyText: Promise<string>;

  constructor(response: Response) {
    this.#response = response;
    this.#bodyText = response.clone().text();
  }

  get raw(): Response {
    return this.#response;
  }

  get status(): number {
    return this.#response.status;
  }

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

  assertHeader(name: string, expected: string | RegExp): this {
    const actual = this.#response.headers.get(name);
    if (actual === null) {
      throw new Error(`assertHeader: header "${name}" is absent`);
    }
    const matches =
      typeof expected === "string"
        ? actual === expected
        : expected.test(actual);
    if (!matches) {
      throw new Error(
        `assertHeader: "${name}" was "${actual}", expected ${String(expected)}`,
      );
    }
    return this;
  }

  async assertJson(expected: unknown): Promise<this> {
    const body = await this.json();
    if (!deepEqual(body, expected)) {
      throw new Error(
        `assertJson: body did not equal expected\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(body)}`,
      );
    }
    return this;
  }

  async assertJsonMatch(expected: unknown): Promise<this> {
    const body = await this.json();
    if (!partialMatch(body, expected)) {
      throw new Error(
        `assertJsonMatch: body did not match expected shape\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(body)}`,
      );
    }
    return this;
  }

  async assertBodyContains(needle: string | RegExp): Promise<this> {
    const body = await this.text();
    const ok =
      typeof needle === "string" ? body.includes(needle) : needle.test(body);
    if (!ok) {
      throw new Error(
        `assertBodyContains: body did not contain ${String(needle)}`,
      );
    }
    return this;
  }

  /**
   * Assert a Set-Cookie header was issued for the named cookie. Does not
   * inspect the value — use assertHeader("set-cookie", /pattern/) for that.
   */
  assertCookieSet(name: string): this {
    const set = this.#response.headers.get("set-cookie");
    if (!set?.includes(`${name}=`)) {
      throw new Error(`assertCookieSet: no Set-Cookie for "${name}"`);
    }
    return this;
  }

  assertRedirect(location?: string | RegExp): this {
    const status = this.#response.status;
    if (status < 300 || status >= 400) {
      throw new Error(`assertRedirect: status ${status} is not a redirect`);
    }
    if (location !== undefined) {
      this.assertHeader("location", location);
    }
    return this;
  }

  /**
   * Assert the request resolved to the named template.
   *
   * @throws NotImplementedError
   *
   * The template layer is not built yet (Phase 11+ per PLAN.md). Once
   * themes land, this will read from a request-scoped tracker populated
   * by the template resolver. The surface is locked in now so tests
   * written against it work verbatim later.
   */
  assertTemplate(_name: string): this {
    throw new Error(
      "assertTemplate is not yet implemented — theme / template system lands with the themes phase. API is stable; call sites written now will work once the feature ships.",
    );
  }
}
