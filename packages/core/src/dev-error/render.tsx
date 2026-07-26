import { renderToStaticMarkup } from "react-dom/server";

import type { DevErrorInfo } from "@plumix/blocks/dev-error";
import { DEV_ERROR_CSS, DevErrorPage } from "@plumix/blocks/dev-error";

import { escapeHtml } from "../escape-html.js";

// The dev-only server error page. Referenced only under the `process.env
// .PLUMIX_DEV` gate at the dispatcher catch, so this module and the shared
// renderer it pulls in tree-shake out of production builds. Nothing here
// touches the theme, layout, or document, so it renders even when the theme
// itself is the culprit (#1582).

// Any value can be thrown in JS; a non-`Error` degrades to a named exception
// carrying its string form.
function toDevErrorInfo(err: unknown): DevErrorInfo {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "UnknownError", message: String(err) };
}

/**
 * SSR the shared dev-error renderer into a complete, standalone HTML document
 * with the token sheet inlined — no theme, no debug bar, no external
 * stylesheet. This is the body the dispatcher returns for a dev 5xx on an HTML
 * request.
 */
export function renderDevErrorPage(err: unknown): string {
  const info = toDevErrorInfo(err);
  const body = renderToStaticMarkup(<DevErrorPage error={info} />);
  const title = escapeHtml(`${info.name}: ${info.message}`);
  return (
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title>` +
    // Reset the document shell so the root's `min-height: 100vh` fills the
    // viewport exactly — without this the default body margin makes the page
    // `100vh + 16px` and scrolls over near-empty content. Kept on the page,
    // not the shared sheet, which the Shadow-DOM overlay (#1603) also uses.
    `<style>html,body{margin:0}${DEV_ERROR_CSS}</style>` +
    `</head><body>${body}</body></html>`
  );
}
