// A form post and a JSON caller spell these the same, so both are one
// submission in two encodings.

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/comments${SUBMIT_ROUTE_PATH}`;

/**
 * Where older root comments are paged from. Unpublished, like the submit
 * path: a theme reaches it through `usePlumixCommentThread`, so the URL is
 * only ever built beside the deployment's base path.
 */
export const LIST_ROUTE_PATH = "/list";
export const LIST_PATH = `/_plumix/comments${LIST_ROUTE_PATH}`;

/**
 * Named for what a bot expects to find. Never echo it back into a form, which
 * would fill it for the bot.
 */
export const HONEYPOT_FIELD = "website";

/**
 * The page the form was on. The no-JavaScript retry's document URL is the
 * endpoint, so the visitor's `Referer` would send them back there, not to the
 * post.
 */
export const RETURN_FIELD = "returnTo";
