import { partialMatch } from "./match.js";

const ORIGIN = "https://cms.example";

/** What a request answered, read whole so each assertion is synchronous. */
export interface TestPageResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
  /** The winning template rule's label; `null` where none rendered. */
  readonly template: string | null;
  /** The content route's pattern; `null` where none matched. */
  readonly route: string | null;
}

/**
 * A page `site.visit` answered. Each assertion returns the page so they chain,
 * and throws a plain `Error` naming what it expected and what it found.
 */
export class TestPage {
  readonly #response: TestPageResponse;

  constructor(response: TestPageResponse) {
    this.#response = response;
  }

  assertOk(): this {
    return this.#assertStatus("assertOk", 200);
  }

  assertNotFound(): this {
    return this.#assertStatus("assertNotFound", 404);
  }

  assertForbidden(): this {
    return this.#assertStatus("assertForbidden", 403);
  }

  /** `to` is a path or an absolute URL, compared resolved against the site. */
  assertRedirect(to: string): this {
    const { status, headers } = this.#response;
    const location = headers.get("location");
    if (status < 300 || status >= 400 || location === null) {
      throw new Error(
        `assertRedirect: expected a redirect to "${to}", got status ${String(status)}.`,
      );
    }
    if (new URL(location, ORIGIN).href === new URL(to, ORIGIN).href) {
      return this;
    }
    throw new Error(
      `assertRedirect: expected a redirect to "${to}", got one to "${location}".`,
    );
  }

  /** Matches the text as written or HTML-escaped, as a template prints it. */
  assertSee(text: string): this {
    if (this.#contains(text)) return this;
    throw new Error(
      `assertSee: expected the page to contain "${text}", but it does not.\n${this.#bodyExcerpt()}`,
    );
  }

  assertDontSee(text: string): this {
    if (!this.#contains(text)) return this;
    throw new Error(
      `assertDontSee: expected the page not to contain "${text}", but it does.`,
    );
  }

  /**
   * The rule label as the debug bar shows it: a tier like `fallback`, or
   * `post:hello`, `post#12`, `archive:post`.
   */
  assertTemplate(name: string): this {
    const { template } = this.#response;
    if (template === name) return this;
    throw new Error(
      template === null
        ? `assertTemplate: expected "${name}", but no template rendered.`
        : `assertTemplate: expected "${name}", got "${template}".`,
    );
  }

  /** The pattern as the route was registered, such as `/` or `/:slug`. */
  assertRoute(pattern: string): this {
    const { route } = this.#response;
    if (route === pattern) return this;
    throw new Error(
      route === null
        ? `assertRoute: expected route "${pattern}", but no content route matched.`
        : `assertRoute: expected route "${pattern}", got "${route}".`,
    );
  }

  /** With no `value`, only that the header is there. */
  assertHeader(name: string, value?: string): this {
    const found = this.#response.headers.get(name);
    if (found === null) {
      throw new Error(
        `assertHeader: expected a "${name}" header, but there is none.`,
      );
    }
    if (value === undefined || found === value) return this;
    throw new Error(
      `assertHeader: expected "${name}" to be "${value}", got "${found}".`,
    );
  }

  /** The body may hold more than `expected`, as `toMatchObject` allows. */
  assertJson(expected: unknown): this {
    let body: unknown;
    try {
      body = JSON.parse(this.#response.body);
    } catch {
      throw new Error(
        `assertJson: expected a JSON body, got: ${this.#bodyExcerpt()}`,
      );
    }
    if (partialMatch(body, expected)) return this;
    throw new Error(
      `assertJson: expected the body to match ${JSON.stringify(expected)}, got ${this.#response.body}.`,
    );
  }

  #assertStatus(assertion: string, status: number): this {
    if (this.#response.status === status) return this;
    throw new Error(
      `${assertion}: expected status ${String(status)}, got ${String(this.#response.status)}.`,
    );
  }

  #contains(text: string): boolean {
    const { body } = this.#response;
    return body.includes(text) || body.includes(escapeHtml(text));
  }

  #bodyExcerpt(): string {
    const { body } = this.#response;
    return body.length > 500 ? `${body.slice(0, 500)}…` : body;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}
