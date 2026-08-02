import { matchCoreErrorHints } from "./hints/core-hints.js";
import { renderDevErrorPage } from "./render.js";

/**
 * Renders the standalone dev error page for a failure thrown while constructing
 * the app (invalid theme registration, plugin setup error, …). The generated
 * worker entry guards `buildApp` and, in dev, serves this for every request so a
 * boot failure shows the exception, stack, and — when core recognizes the error
 * — its "how to fix" hint, instead of an opaque crash (#1601, decision #1577).
 *
 * At boot no app exists yet, so there is no `error_page:hints` filter to run;
 * hints come straight from core's matchers. There's likewise no request context,
 * so the page degrades to just the exception, hint, and stack (no request /
 * route / database sections). Referenced only under the worker entry's
 * `process.env.PLUMIX_DEV` gate, so this module tree-shakes out of production
 * builds, where the boot throw rethrows unchanged.
 */
export function renderDevBootErrorResponse(err: unknown): Response {
  return new Response(renderDevErrorPage(err, matchCoreErrorHints(err)), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
