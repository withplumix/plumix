/**
 * The names the rendered markup, the island and the submit handler agree
 * on. A comment arrives as a flat urlencoded body from a plain form and as
 * JSON from a scripted caller, and both spell these the same way — so the
 * two paths are one submission in two encodings rather than two endpoints.
 */

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/comments${SUBMIT_ROUTE_PATH}`;

/**
 * The honeypot, named for what a bot expects to find rather than for what
 * it is: the trap works by looking like an ordinary field. Never echoed
 * back into a form the handler hands a visitor, which would fill it for
 * the bot that tripped it.
 */
export const HONEYPOT_FIELD = "website";

/**
 * The page the form was on, carried by the re-rendered form the
 * no-JavaScript path answers a refused comment with. The document URL is
 * the endpoint by then, so the visitor's own `Referer` would send their
 * retry back to the endpoint rather than to the post.
 *
 * Unprefixed, where `@plumix/plugin-forms` spells its equivalent
 * `__plumix_return`: a form's fields are declared by the site and could
 * claim any name, while a comment's are this closed set, so there is
 * nothing here for a reserved prefix to keep it apart from.
 */
export const RETURN_FIELD = "returnTo";
