import { renderToStaticMarkup } from "react-dom/server";

import type {
  DevErrorContext,
  DevErrorHint,
  DevErrorInfo,
  RenderedDevErrorPanel,
} from "../ui/index.js";
import { escapeHtml } from "../../escape-html.js";
import {
  DEV_ERROR_CSS,
  DevErrorPage,
  enhanceDevError,
  parseStackFrames,
  resolveEditorPathMap,
  resolveEditorTemplate,
} from "../ui/index.js";

// Nothing here touches the theme, layout, or document, so the page renders
// even when the theme itself is the culprit.

/**
 * Self-contained by design, so stringifying it is enough: it reads the
 * resolver endpoint and the frames off the DOM.
 */
const ENHANCE_SCRIPT = `(${enhanceDevError.toString()})(document);`;

/**
 * Shared by the HTML page and the JSON payload so both name and describe an
 * exception identically.
 */
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

/**
 * In `plumix dev` the stack is already sourcemapped to original `file:line`.
 */
function toDevErrorInfo(err: unknown): DevErrorInfo {
  const basics = toErrorBasics(err);
  const frames = basics.stack ? parseStackFrames(basics.stack) : [];
  return { ...basics, ...(frames.length > 0 ? { frames } : {}) };
}

/**
 * The dev-only JSON error payload — the wire shape {@link devErrorJson}
 * returns.
 */
export interface DevErrorJson {
  /** The exception's name, e.g. `TypeError`. */
  readonly error: string;
  readonly message: string;
  readonly stack?: string;
  readonly hints?: readonly DevErrorHint[];
}

/** For a 5xx on a request that negotiated away from HTML. Dev-gated. */
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
 * Omit `context` and `panels` on the boot-error path, where the page degrades
 * to the exception, hints, and stack.
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
  // Vite substitutes the literal at bundle time; unset means VS Code.
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
    // Without the reset the default body margin makes the page `100vh + 16px`.
    // Not in the shared sheet, which the Shadow-DOM overlay also uses.
    `<style>html,body{margin:0}${DEV_ERROR_CSS}</style>` +
    `</head><body>${body}${script}</body></html>`
  );
}
