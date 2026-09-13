import type { AppContext } from "../../context/app.js";
import { jsonResponse } from "../../runtime/http.js";
import { collectDevErrorContext } from "./context.js";
import { collectDevErrorHints } from "./hints/collect.js";
import { collectDevErrorPanels } from "./panels/collect.js";
import { devErrorJson, renderDevErrorPage } from "./render.js";

/**
 * The dev error surface's answer to a caught failure: the standalone error
 * page, which is theme-independent so it renders even when the theme is what
 * threw, or the exception as JSON for a caller that can't use a document
 * (#1599). Null when the surface itself broke, so the caller's own 500 still
 * answers (#1582).
 *
 * Callers gate on `process.env.PLUMIX_DEV` and a trusted request before calling,
 * which is what drops this module from a production build.
 */
export function devErrorResponse(
  ctx: AppContext,
  err: unknown,
  wantsHtml: boolean,
): Response | null {
  try {
    const hints = collectDevErrorHints(ctx.hooks, err, ctx);
    if (!wantsHtml) {
      return jsonResponse(devErrorJson(err, hints), { status: 500 });
    }
    // Context is read from the same request-scoped collectors the debug bar
    // uses (#1598); dev sampling is ensured without the bar, so it is populated
    // either way.
    const context = collectDevErrorContext(ctx);
    const panels = collectDevErrorPanels(ctx.hooks, err, ctx);
    return new Response(renderDevErrorPage(err, hints, context, panels), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (devErr) {
    ctx.logger.error("dev_error_page_failed", {
      url: ctx.request.url,
      err: devErr instanceof Error ? devErr.message : String(devErr),
    });
    return null;
  }
}
