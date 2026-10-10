import type { Db } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";

export interface FetchOptions {
  readonly method?:
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  readonly headers?: HeadersInit;
  readonly body?: BodyInit;
  /**
   * JSON body, exclusive with `body`. An RPC call through `fetch` carries the
   * oRPC `{ json: input }` envelope itself.
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
   * This request's client address, winning over the harness's. Not on
   * `FetchOptions` because the runtime supplies an address beside a request,
   * never as a header.
   */
  readonly clientAddress?: string;
}

const ORIGIN = "https://cms.example";

/**
 * Appends a cookie to a `Headers`, preserving any cookie already there.
 * `Headers.set` replaces the whole header, which drops cookies a test set
 * on the request before signing it in.
 */
export function appendCookie(headers: Headers, cookie: string): void {
  const existing = headers.get("cookie");
  headers.set("cookie", existing ? `${existing}; ${cookie}` : cookie);
}

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
    appendCookie(headers, `${SESSION_COOKIE_NAME}=${token}`);
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
 * Wraps a Response with chainable assertions; returned from `harness.fetch()`.
 * Add a method when a test first needs it.
 */
export class TestResponse {
  readonly #response: Response;
  readonly #bodyText: Promise<string>;
  readonly #resolvedTemplate: string | null;

  constructor(response: Response, resolvedTemplate: string | null) {
    this.#response = response;
    this.#resolvedTemplate = resolvedTemplate;
    this.#bodyText = response.clone().text();
  }

  // fallow treats test files as terminal entry points, so it flags these
  // test-only members as unused.

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
   * Assert the request rendered through the named template rule, labelled as
   * the debug bar shows it: a tier like `fallback`, or `post:hello`, `post#12`,
   * `archive:post`.
   */
  // fallow-ignore-next-line unused-class-member
  assertTemplate(name: string): this {
    if (this.#resolvedTemplate === null) {
      throw new Error(
        `assertTemplate: expected "${name}", but no template was resolved`,
      );
    }
    if (this.#resolvedTemplate !== name) {
      throw new Error(
        `assertTemplate: expected "${name}", got "${this.#resolvedTemplate}"`,
      );
    }
    return this;
  }
}
