/**
 * The resolved-error contract the shared dev-error renderer consumes. Both the
 * server dev error page (SSR, in core) and the client island overlay (#1603)
 * feed this identical shape, so the two surfaces look and read the same.
 */
export interface DevErrorInfo {
  readonly name: string;
  readonly message: string;
  /** The raw, unresolved stack trace, when the exception carried one. */
  readonly stack?: string;
  /**
   * The stack parsed into structured frames (original `file:line`, since the
   * dev stack arrives already sourcemapped). Absent when the exception carried
   * no stack or none of its lines were locatable — the renderer then falls
   * back to the raw {@link stack}.
   */
  readonly frames?: readonly DevErrorFrame[];
  /**
   * Actionable "how to fix" hints matched to this error (#1597). Collected
   * server-side via the dev-only `error_page:hints` filter and rendered as a
   * prominent card above the stack. Absent when nothing recognized the error —
   * the page then shows no hint card at all.
   */
  readonly hints?: readonly DevErrorHint[];
}

/**
 * One "how to fix" hint. `title` is a short imperative ("Run your migrations");
 * `body` explains; `docs` links out to further reading. Plain strings — a
 * dev-only, English surface matching the framework's error-message voice, not
 * i18n `Label`s. Contributed and overridden through the `error_page:hints`
 * filter, which is the plugin-facing hint API.
 */
export interface DevErrorHint {
  readonly title: string;
  readonly body?: string;
  readonly docs?: readonly DevErrorHintDoc[];
}

/** A "read more" link on a {@link DevErrorHint}. */
export interface DevErrorHintDoc {
  readonly label: string;
  readonly href: string;
}

/**
 * One resolved stack frame. `file` is the original absolute source path; the
 * dev source-frame resolver reads it (Node-side, with `fs`) to produce the
 * excerpt the renderer highlights — the worker never touches the filesystem.
 */
export interface DevErrorFrame {
  /** The enclosing function, when the stack named one. */
  readonly functionName?: string;
  /** The original source path (a real fs path once `file://` is stripped). */
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  /** `node_modules` / `node:` frames — collapsed behind a toggle by default. */
  readonly isVendor: boolean;
}
