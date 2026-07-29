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
  /**
   * The React component stack, when the error came from a component tree — the
   * client island overlay (#1603) reads it off React's root error callbacks and
   * the renderer shows it as its own section. Absent on server SSR errors, which
   * carry no component stack.
   */
  readonly componentStack?: string;
  /**
   * The captured server-vs-client HTML pair for a dev island hydration mismatch
   * (#1668) — the island's own markup before `hydrateRoot` (the server render)
   * and after React's recovery re-render (the client render). Set only by the
   * overlay's mismatch path; the page renders a diff section when present and
   * every other dev-error surface leaves it unset.
   */
  readonly hydrationDiff?: DevErrorHydrationDiff;
}

/** The server/client HTML pair a hydration mismatch (#1668) diffs. */
export interface DevErrorHydrationDiff {
  /** The island's markup before `hydrateRoot` — the server (SSR) render. */
  readonly server: string;
  /** The island's markup after React's recovery re-render — the client render. */
  readonly client: string;
}

/**
 * The request-scoped context the server dev error page shows below the stack
 * (#1598): the request itself, the entity/template that resolved, the executed
 * queries, the timeline of spans, and the app/environment facts. Core builds it
 * from the same request-scoped collectors the debug bar reads and passes it in.
 *
 * Absent on the surfaces that have no request context — the client island
 * overlay and the boot-error fallback — where the page degrades to just the
 * exception, hints, and stack. Each field also degrades on its own: an empty
 * {@link queries}/{@link timeline} renders an explicit "nothing recorded" note
 * rather than a blank gap.
 */
export interface DevErrorContext {
  readonly request: DevErrorRequestInfo;
  readonly route: DevErrorRoute;
  readonly queries: readonly DevErrorQuery[];
  readonly timeline: DevErrorTimeline;
  /** Static app/environment facts (site, origin, locale, wired slots, plugins). */
  readonly app: readonly DevErrorFact[];
}

/** The request as the router saw it — method, full URL, and every header. */
export interface DevErrorRequestInfo {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly DevErrorFact[];
}

/**
 * What the request resolved to render. Both optional: an error before (or
 * instead of) resolution — a 404, a boot failure, a theme that threw before a
 * node matched — leaves them unset, and the section shows an empty note.
 */
export interface DevErrorRoute {
  /** The resolved entity, e.g. `entry #12` or `archive: post`. */
  readonly entity?: string;
  /** The template node that matched, when one did. */
  readonly template?: string;
}

/** One executed query — its SQL, its timing, and whether it was the one that threw. */
export interface DevErrorQuery {
  readonly sql: string;
  /** Round-trip time; absent for a statement timed only as part of a batch. */
  readonly durationMs?: number;
  /** True for the query whose span errored — the failing query the page flags. */
  readonly failed: boolean;
  /**
   * True for a statement that belonged to a batch that failed as a whole. A
   * driver batch is one atomic round-trip: when a statement throws it rolls
   * back the sequence, and neither D1 nor libsql reports which statement it
   * was. So the page flags the group rather than claiming any single row
   * {@link failed} — distinct because that would misread as "this exact
   * statement threw."
   */
  readonly batchFailed?: boolean;
}

/** The request's span waterfall, flattened for a zero-JS bar chart. */
export interface DevErrorTimeline {
  readonly rows: readonly DevErrorTimelineRow[];
  /** Window span (latest end − earliest start), the denominator for bar widths. */
  readonly totalMs: number;
}

/** One span flattened into a waterfall row. */
export interface DevErrorTimelineRow {
  readonly name: string;
  /** Nesting depth; 0 for a root span. */
  readonly depth: number;
  /** Start offset from the window start, in ms — positions the bar. */
  readonly offsetMs: number;
  readonly durationMs: number;
  /** True when this span errored — flags where the request died. */
  readonly failed: boolean;
}

/** A labeled fact — a request header, or one app/environment line. */
export interface DevErrorFact {
  readonly label: string;
  readonly value: string;
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
 * One plugin-contributed panel (#1626), already rendered to inert HTML — the
 * section the dev error page shows below its built-in context. Collected and
 * rendered by core's dev-only `error_page:panels` filter.
 */
export interface RenderedDevErrorPanel {
  /** Stable id — the React key and the label in a failed-render notice. */
  readonly id: string;
  /** Section heading; a dev-only English string, like a {@link DevErrorHint}. */
  readonly title: string;
  /** The panel's isolated SSR output, inlined into the section. */
  readonly html: string;
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
