import { matchCoreErrorHints } from "./hints/core-hints.js";
import { renderDevErrorPage } from "./render.js";

/**
 * No app exists at boot, so hints come straight from core's matchers and the
 * page shows no request sections. Call only under a `PLUMIX_DEV` gate.
 */
export function renderDevBootErrorResponse(err: unknown): Response {
  return new Response(renderDevErrorPage(err, matchCoreErrorHints(err)), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
