import type { RedirectStatus } from "./redirects.js";

// Registered rather than unique, so an outcome a separately bundled copy of
// this module made is still recognised.
const BRAND = Symbol.for("plumix.pageOutcome");

type OutcomeFields =
  | { readonly kind: "not-found" }
  | {
      readonly kind: "redirect";
      readonly location: string;
      readonly status: RedirectStatus;
    };

/**
 * How a page step ends the request (ADR 0032): an archive type's `resolve`, a
 * template dep, a block loader on the page's own content, or the template's
 * `document()` throws one, and the dispatcher answers with it instead of the
 * page. An `Error`, so it can be thrown wherever an error can; thrown anywhere
 * else it is one.
 */
export type PageOutcome = Error & { readonly [BRAND]: true } & OutcomeFields;

function outcome(message: string, fields: OutcomeFields): PageOutcome {
  const error = new Error(message);
  error.name = "PageOutcome";
  return Object.assign(error, { [BRAND]: true as const }, fields);
}

/** Throw it to answer the page with the theme's 404, as a `null` resolve does. */
export function pageNotFound(): PageOutcome {
  return outcome("pageNotFound() thrown outside a page step", {
    kind: "not-found",
  });
}

/**
 * Throw it to answer the page with a redirect to `location`, used as given. It
 * defaults to 302, and is never stored by a cache, because what sends a
 * visitor elsewhere is usually their session or state.
 */
export function redirectTo(
  location: string,
  status: RedirectStatus = 302,
): PageOutcome {
  return outcome(`redirectTo("${location}") thrown outside a page step`, {
    kind: "redirect",
    location,
    status,
  });
}

export function isPageOutcome(value: unknown): value is PageOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<Record<typeof BRAND, unknown>>)[BRAND] === true
  );
}
