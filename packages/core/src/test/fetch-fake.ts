import type { PlumixFetch } from "../context/app-context.js";
import { DEFAULT_TIMEOUT_MS, timeoutError } from "../context/traced-fetch.js";
import { deepEqual } from "./match.js";

/**
 * What a route answers: a response, or a failure rejected as the real
 * `ctx.fetch` rejects it, at once.
 */
export type FetchAnswer =
  | Response
  /** The `TypeError` the platform's `fetch` rejects with when it gets no answer. */
  | "network error"
  /** The `TimeoutError` `ctx.fetch` rejects with once the call's `timeout` runs out. */
  | "timeout";

interface Route {
  readonly method: string;
  readonly url: string;
  readonly pattern: RegExp;
  readonly answer: FetchAnswer;
}

interface FetchedRequest {
  readonly method: string;
  readonly url: string;
  /** Empty for a request with no body. */
  readonly body: string;
}

interface FetchFilter {
  readonly method?: string;
  /** A string is the body's text; anything else, the JSON it parses to. */
  readonly body?: unknown;
}

/**
 * Answers `ctx.fetch` from the routes a test declares. Each assertion throws a
 * plain `Error` listing what was fetched, so it reads the same in any test
 * runner.
 */
export interface FetchFake {
  /**
   * Answers `method` requests to `url`, in which each `*` matches any run of
   * characters.
   */
  readonly route: (method: string, url: string, answer: FetchAnswer) => void;
  /** Throws unless a request to `url`, a pattern as `route` takes, matched. */
  readonly assertFetched: (url: string, options?: FetchFilter) => void;
  readonly assertNotFetched: (url: string) => void;
  /**
   * Throws what the first request no route answered threw, for a test whose
   * code caught it.
   */
  readonly assertAllDeclared: () => void;
  /** Answers a request as the platform's `fetch` would. */
  readonly send: PlumixFetch;
}

export function fakeFetch(): FetchFake {
  const routes: Route[] = [];
  const fetched: FetchedRequest[] = [];
  const undeclared: Error[] = [];

  function fail(expectation: string): never {
    throw new Error(`${expectation}\n${describeFetched(fetched)}`);
  }

  return {
    route: (method, url, answer) => {
      routes.push({
        method: method.toUpperCase(),
        url,
        pattern: urlPattern(url),
        answer,
      });
    },
    assertFetched: (url, options = {}) => {
      const pattern = urlPattern(url);
      const method = options.method?.toUpperCase();
      const found = fetched.some(
        (request) =>
          pattern.test(request.url) &&
          (method === undefined || request.method === method) &&
          (!("body" in options) || bodyMatches(request.body, options.body)),
      );
      if (found) return;
      fail(
        `Expected ${describeFilter(url, method, options)} to be fetched, but it was not.`,
      );
    },
    assertNotFetched: (url) => {
      const pattern = urlPattern(url);
      const count = fetched.filter((request) =>
        pattern.test(request.url),
      ).length;
      if (count === 0) return;
      fail(
        `Expected ${url} not to be fetched, but it was ${plural(count, "time")}.`,
      );
    },
    assertAllDeclared: () => {
      const [first] = undeclared;
      if (first !== undefined) throw first;
    },
    send: async (input, init) => {
      const request = new Request(input, init);
      fetched.push({
        method: request.method,
        url: request.url,
        body: await request.clone().text(),
      });
      const route = routes.find(
        (candidate) =>
          candidate.method === request.method &&
          candidate.pattern.test(request.url),
      );
      if (route === undefined) {
        const error = new Error(
          `fetch: no route answers ${request.method} ${request.url}. ` +
            `Declare one with site.fetch.route(method, url, answer).\n` +
            describeRoutes(routes),
        );
        undeclared.push(error);
        throw error;
      }
      const { answer } = route;
      if (answer === "network error") throw new TypeError("fetch failed");
      if (answer === "timeout") {
        const timeout = init?.timeout;
        throw timeoutError(
          typeof timeout === "number" ? timeout : DEFAULT_TIMEOUT_MS,
        );
      }
      return answer.clone();
    },
  };
}

/** A URL with no `*` is matched as `Request` spells it, so `https://a.example` meets `https://a.example/`. */
function urlPattern(url: string): RegExp {
  const spelled =
    !url.includes("*") && URL.canParse(url) ? new URL(url).href : url;
  const literals = spelled
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${literals.join(".*")}$`);
}

function bodyMatches(text: string, expected: unknown): boolean {
  if (typeof expected === "string") return text === expected;
  try {
    return deepEqual(JSON.parse(text), expected);
  } catch {
    return false;
  }
}

function describeFilter(
  url: string,
  method: string | undefined,
  options: FetchFilter,
): string {
  const prefix = method === undefined ? "" : `${method} `;
  const body =
    "body" in options ? ` with body ${describeBody(options.body)}` : "";
  return `${prefix}${url}${body}`;
}

function describeBody(body: unknown): string {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function describeRoutes(routes: readonly Route[]): string {
  if (routes.length === 0) return "No route is declared.";
  const lines = routes.map((route) => `  - ${route.method} ${route.url}`);
  return ["Declared routes:", ...lines].join("\n");
}

function describeFetched(fetched: readonly FetchedRequest[]): string {
  if (fetched.length === 0) return "Nothing was fetched.";
  const lines = fetched.map(
    ({ method, url, body }) =>
      `  - ${method} ${url}${body === "" ? "" : ` ${body}`}`,
  );
  return ["Fetched:", ...lines].join("\n");
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
