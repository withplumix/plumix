export interface DevErrorInfo {
  readonly name: string;
  readonly message: string;
  /** The raw, unresolved stack trace, when the exception carried one. */
  readonly stack?: string;
  /**
   * Absent when no stack line was locatable; the renderer then falls back to
   * the raw {@link stack}.
   */
  readonly frames?: readonly DevErrorFrame[];
  /**
   * Absent when nothing recognized the error, and the page shows no hint card.
   */
  readonly hints?: readonly DevErrorHint[];
  /** Absent on server SSR errors, which carry no component stack. */
  readonly componentStack?: string;
  /**
   * The island's markup before `hydrateRoot` and after React's recovery
   * re-render. Set only by the overlay's hydration-mismatch path.
   */
  readonly hydrationDiff?: DevErrorHydrationDiff;
}

/** The server/client HTML pair a hydration mismatch (#1668) diffs. */
export interface DevErrorHydrationDiff {
  /** The island's markup before `hydrateRoot` — the server (SSR) render. */
  readonly server: string;
  /**
   * The island's markup after React's recovery re-render — the client render.
   */
  readonly client: string;
}

/**
 * Absent on surfaces with no request context: the client island overlay and
 * the boot-error fallback.
 */
export interface DevErrorContext {
  readonly request: DevErrorRequestInfo;
  readonly route: DevErrorRoute;
  readonly queries: readonly DevErrorQuery[];
  readonly timeline: DevErrorTimeline;
  /**
   * Static app/environment facts (site, origin, locale, wired slots, plugins).
   */
  readonly app: readonly DevErrorFact[];
}

interface DevErrorRequestInfo {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly DevErrorFact[];
}

/**
 * Both unset when the error came before or instead of resolution: a 404, a
 * boot failure, or a theme that threw before a node matched.
 */
interface DevErrorRoute {
  /** e.g. `entry #12` or `archive: post`. */
  readonly entity?: string;
  readonly template?: string;
}

/**
 * One executed query — its SQL, its timing, and whether it was the one that
 * threw.
 */
export interface DevErrorQuery {
  readonly sql: string;
  /** Round-trip time; absent for a statement timed only as part of a batch. */
  readonly durationMs?: number;
  /**
   * True for the query whose span errored — the failing query the page flags.
   */
  readonly failed: boolean;
  /**
   * The statement's batch failed as a whole. Neither D1 nor libsql reports
   * which statement threw, so the page flags the group, not one row.
   */
  readonly batchFailed?: boolean;
}

/** The request's span waterfall, flattened for a zero-JS bar chart. */
export interface DevErrorTimeline {
  readonly rows: readonly DevErrorTimelineRow[];
  /**
   * Window span (latest end − earliest start), the denominator for bar widths.
   */
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
 * Plain strings, not i18n `Label`s: the surface is dev-only and English, like
 * the framework's error messages.
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
  /**
   * Section heading; a dev-only English string, like a {@link DevErrorHint}.
   */
  readonly title: string;
  /** The panel's isolated SSR output, inlined into the section. */
  readonly html: string;
}

/**
 * `file` is the original absolute source path; only the Node-side resolver
 * reads it, since the worker never touches the filesystem.
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
