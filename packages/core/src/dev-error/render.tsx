import { renderToStaticMarkup } from "react-dom/server";

import type {
  DevErrorContext,
  DevErrorHint,
  DevErrorInfo,
  RenderedDevErrorPanel,
} from "@plumix/blocks/dev-error";
import {
  DEV_ERROR_CSS,
  DevErrorPage,
  enhanceDevError,
  parseStackFrames,
  resolveEditorPathMap,
  resolveEditorTemplate,
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
// carrying its string form. Shared by the HTML page and the JSON payload so the
// two surfaces name and describe an exception identically.
function toErrorBasics(err: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
    };
  }
  return { name: "UnknownError", message: String(err) };
}

// When the exception carried a stack, it is parsed into frames here (in `plumix
// dev` the stack is already sourcemapped to original `file:line`), so the page
// shows the frame view; otherwise it falls back to the raw stack.
function toDevErrorInfo(err: unknown): DevErrorInfo {
  const basics = toErrorBasics(err);
  const frames = basics.stack ? parseStackFrames(basics.stack) : [];
  return { ...basics, ...(frames.length > 0 ? { frames } : {}) };
}

/** The dev-only JSON error payload — the wire shape {@link devErrorJson} returns. */
export interface DevErrorJson {
  /** The exception's name, e.g. `TypeError`. */
  readonly error: string;
  readonly message: string;
  readonly stack?: string;
  readonly hints?: readonly DevErrorHint[];
}

/**
 * The dev-only JSON error payload the dispatcher returns for a 5xx on a request
 * that negotiated away from HTML — an API or fetch call, which would otherwise
 * get the bare "Internal Server Error" text (#1599). Behind the same dev gate as
 * {@link renderDevErrorPage}, so it tree-shakes out of production.
 */
export function devErrorJson(
  err: unknown,
  hints: readonly DevErrorHint[] = [],
): DevErrorJson {
  const { name, message, stack } = toErrorBasics(err);
  return {
    error: name,
    message,
    ...(stack ? { stack } : {}),
    ...(hints.length > 0 ? { hints } : {}),
  };
}

/**
 * SSR the shared dev-error renderer into a complete, standalone HTML document
 * with the token sheet inlined — no theme, no debug bar, no external
 * stylesheet. This is the body the dispatcher returns for a dev 5xx on an HTML
 * request. When frames were resolved, the client enhancement is inlined so
 * selecting a frame lazy-fetches its highlighted source excerpt. The dispatcher
 * collects `hints` from the `error_page:hints` filter and passes them in; the
 * renderer surfaces them as a "how to fix" card above the stack. When the
 * dispatcher collected the request's context (`collectDevErrorContext`), it is
 * passed in and rendered as the request / route / database / timeline /
 * application sections below the stack (#1598); omitted on the boot-error path,
 * where the page degrades to just the exception, hints, and stack. Plugin
 * `panels` collected from the `error_page:panels` filter (#1626) render as
 * their own sections below the context; empty or omitted on the boot path.
 */
export function renderDevErrorPage(
  err: unknown,
  hints: readonly DevErrorHint[] = [],
  context?: DevErrorContext,
  panels: readonly RenderedDevErrorPanel[] = [],
): string {
  const info: DevErrorInfo = {
    ...toDevErrorInfo(err),
    ...(hints.length > 0 ? { hints } : {}),
  };
  // Resolve the open-in-editor scheme from `PLUMIX_EDITOR` (#1581) so each frame
  // links to the file at its line in the developer's editor. Vite substitutes
  // the literal at bundle time (see the plugin's `define`); unset → VS Code.
  const editor = resolveEditorTemplate(process.env.PLUMIX_EDITOR);
  // And the optional path remap from `PLUMIX_EDITOR_PATH_MAP` (#1627), which
  // rewrites the on-server frame path to the editor host's when the dev server
  // runs in a container or on a remote box.
  const editorPathMap = resolveEditorPathMap(
    process.env.PLUMIX_EDITOR_PATH_MAP,
  );
  const body = renderToStaticMarkup(
    <DevErrorPage
      error={info}
      context={context}
      panels={panels}
      editor={editor}
      editorPathMap={editorPathMap}
    />,
  );
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
