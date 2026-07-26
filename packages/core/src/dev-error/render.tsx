import { renderToStaticMarkup } from "react-dom/server";

import type { DevErrorInfo } from "@plumix/blocks/dev-error";
import {
  DEV_ERROR_CSS,
  DevErrorPage,
  enhanceDevError,
  parseStackFrames,
} from "@plumix/blocks/dev-error";

import { escapeHtml } from "../escape-html.js";

// The dev-only server error page. Referenced only under the `process.env
// .PLUMIX_DEV` gate at the dispatcher catch, so this module and the shared
// renderer it pulls in tree-shake out of production builds. Nothing here
// touches the theme, layout, or document, so it renders even when the theme
// itself is the culprit (#1582).

// The client enhancement, inlined into the page. It is self-contained by
// design, so stringifying it is enough — it reads everything it needs (the
// resolver endpoint, the frames) off the DOM. Computed once at module load;
// the whole module tree-shakes out of production with the dev gate.
const ENHANCE_SCRIPT = `(${enhanceDevError.toString()})(document);`;

// Any value can be thrown in JS; a non-`Error` degrades to a named exception
// carrying its string form. When the exception carried a stack, it is parsed
// into frames here (in `plumix dev` the stack is already sourcemapped to
// original `file:line`), so the page shows the frame view; otherwise it falls
// back to the raw stack.
function toDevErrorInfo(err: unknown): DevErrorInfo {
  if (err instanceof Error) {
    const frames = err.stack ? parseStackFrames(err.stack) : [];
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(frames.length > 0 ? { frames } : {}),
    };
  }
  return { name: "UnknownError", message: String(err) };
}

/**
 * SSR the shared dev-error renderer into a complete, standalone HTML document
 * with the token sheet inlined — no theme, no debug bar, no external
 * stylesheet. This is the body the dispatcher returns for a dev 5xx on an HTML
 * request. When frames were resolved, the client enhancement is inlined so
 * selecting a frame lazy-fetches its highlighted source excerpt.
 */
export function renderDevErrorPage(err: unknown): string {
  const info = toDevErrorInfo(err);
  const body = renderToStaticMarkup(<DevErrorPage error={info} />);
  const title = escapeHtml(`${info.name}: ${info.message}`);
  const script =
    info.frames && info.frames.length > 0
      ? `<script>${ENHANCE_SCRIPT}</script>`
      : "";
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
    `</head><body>${body}${script}</body></html>`
  );
}
