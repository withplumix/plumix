import type { Db } from "../context/app.js";
import type { User } from "../db/schema/users.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";

export interface FetchOptions {
  readonly method?:
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  readonly headers?: HeadersInit;
  readonly body?: BodyInit;
  /**
   * JSON body. Mutually exclusive with `body`. Sets content-type to
   * application/json and serialises via JSON.stringify. A call to an RPC
   * procedure through `fetch` carries the oRPC envelope itself
   * (`{ json: input }`); `createRpcHarness`'s client handles the wire format.
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

/**
 * What `harness.fetch` takes: everything that shapes the request, plus the
 * facts the runtime supplies alongside it.
 */
export interface HarnessFetchOptions extends FetchOptions {
  /**
   * The client address the runtime reports for this one request — what a real
   * adapter varies between visitors. Wins over the harness's own
   * `clientAddress`.
   *
   * It lives here rather than on {@link FetchOptions} because `buildRequest`
   * could not honour it: an address is a fact the runtime supplies alongside a
   * request, never a header on it. The harness reads it when it builds the
   * context.
   */
  readonly clientAddress?: string;
}

const ORIGIN = "https://cms.example";

export async function buildRequest(
  db: Db,
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
 * `assertRedirect`, `assertHeader`, plus `raw` / `status` getters —
 * nothing called them, so they were removed under the
 * "address fallow dead-code" pass. Re-add a method when you write
 * the first test that needs it. `assertTemplate` is intentionally
 * kept as a NotImplemented stub for the upcoming themes phase
 * (Phase 11+); see its JSDoc.
 */
export class TestResponse {
  readonly #response: Response;
  readonly #bodyText: Promise<string>;

  constructor(response: Response) {
    this.#response = response;
    this.#bodyText = response.clone().text();
  }

  // The five members below are consumed only from *.test.ts files;
  // fallow's class-member analyser treats test files as terminal
  // entry points (not usage sites), so it flags everything as unused
  // even though the passkey-routes test suite calls them directly.
  // Per-line suppressions document the consumer.

  // fallow-ignore-next-line unused-class-member
  get headers(): Headers {
    return this.#response.headers;
  }

  // fallow-ignore-next-line unused-class-member
  async text(): Promise<string> {
    return this.#bodyText;
  }

  // fallow-ignore-next-line unused-class-member
  async json<T = unknown>(): Promise<T> {
    const text = await this.#bodyText;
    return JSON.parse(text) as T;
  }

  // fallow-ignore-next-line unused-class-member
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
  // fallow-ignore-next-line unused-class-member
  assertCookieSet(name: string): this {
    const set = this.#response.headers.get("set-cookie");
    if (!set?.includes(`${name}=`)) {
      throw new Error(`assertCookieSet: no Set-Cookie for "${name}"`);
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
  // fallow-ignore-next-line unused-class-member
  assertTemplate(_name: string): this {
    throw new Error(
      "assertTemplate is not yet implemented — theme / template system lands with the themes phase. API is stable; call sites written now will work once the feature ships.",
    );
  }
}
