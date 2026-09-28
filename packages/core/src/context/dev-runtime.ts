import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { TelemetryRecord, TelemetrySpan } from "./telemetry.js";

// The dev runtime every request carries as `ctx.dev`, with the capture shapes
// it names. Declared here, not under `dev/`, so the context type can name them
// without reaching up into a surface; `dev/` implements them.

// Exported only for `DebugBarInput`; users write the position as a string
// literal, so it needs no public name.
export type DebugBarPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface NormalizedDebugBar {
  readonly enabled: boolean;
  readonly position: DebugBarPosition;
  readonly defaultOpen: boolean;
}

/**
 * A bounded, fixed projection of request context — the only parts of the live
 * `AppContext` a debug panel is allowed to see. Deliberately *not* the raw
 * config or the full entity registry: a small, JSON-serializable slice so a
 * stored snapshot never pins the request graph and a future consumer (the
 * request-history store, an MCP reader) can serialize it verbatim.
 */
export interface DebugContext {
  readonly method: string;
  /** Pathname only — the query string (a secret carrier) is never captured. */
  readonly path: string;
  readonly origin: string;
  readonly basePath: string;
  readonly resolvedEntity: ResolvedEntity | null;
  readonly user: { readonly email: string; readonly role: string } | null;
  readonly tokenScopes: readonly string[] | null;
  readonly siteName: string | null;
  readonly locale: { readonly code: string; readonly direction: string };
  /** Which optional runtime slots the config wired, by presence only. */
  readonly slots: {
    readonly cdn: boolean;
    readonly storage: boolean;
    readonly mailer: boolean;
    readonly images: boolean;
  };
  readonly plugins: {
    readonly ids: readonly string[];
    readonly entryTypes: readonly string[];
    readonly termTaxonomies: readonly string[];
  };
}

/**
 * The serializable model every debug panel renders from: the request's span
 * tree, its telemetry records, and the fixed context projection. HTML is only
 * ever a rendering over this JSON — the JSON is never derived from HTML. The
 * same document is what the inline bar renders for the current request and
 * (in the request-history work) what a stored past request replays.
 */
export interface DebugSnapshot {
  readonly context: DebugContext;
  readonly spans: readonly TelemetrySpan[];
  readonly records: Readonly<Record<string, readonly TelemetryRecord[]>>;
}

/**
 * One captured request in the dev request-history: the finished request's
 * identity/outcome plus its {@link DebugSnapshot}. Everything here is inert
 * JSON — the store serializes the snapshot on {@link DebugHistoryStore.save},
 * so an entry never pins a live `ctx`, `Request`, DB connection, or closure.
 * `id` is the request id (the switcher selects and {@link DebugHistoryStore.find}
 * looks up by it); `startedAt`/`status`/`durationMs` label an entry without
 * reopening the snapshot.
 */
export interface DebugHistoryEntry {
  readonly id: string;
  /** When the request began (epoch ms) — the request envelope's `startedAt`. */
  readonly startedAt: number;
  readonly status: number;
  readonly durationMs: number;
  readonly snapshot: DebugSnapshot;
}

/**
 * A bounded, transport-agnostic store of the most recent requests. Four
 * readers share it unchanged — the debug bar, the HTTP read routes and the two
 * dev MCP tools — which is why it is the capture layer's and not any one
 * surface's. The in-memory ring is dev-only and tree-shaken from production.
 */
export interface DebugHistoryStore {
  /**
   * Capture one finished request. The snapshot is deep-copied to inert JSON
   * and payload-bounded (oversized strings truncated) before storing, so the
   * store never retains a live reference and its footprint stays flat. Past
   * the entry-count or total-byte caps the oldest entries are evicted.
   */
  save(entry: DebugHistoryEntry): void;
  /** The stored entry with this request id, or undefined. */
  find(id: string): DebugHistoryEntry | undefined;
  /** Every stored entry, newest first. */
  get(): readonly DebugHistoryEntry[];
}

/**
 * `config.dev`, resolved once when the app is built: the same keys, each in
 * the form its readers consume. The app holds one and hands it to every
 * request as `ctx.dev`. Composed here rather than under `dev/` for the reason
 * `DevInput` lives in `config.ts` — no module in the dev tree has to name all
 * of its layers (ADR 0003).
 */
export interface DevRuntime {
  /** `config.dev.bar`, normalized. */
  readonly bar: NormalizedDebugBar;
  /** `config.dev.panels`, resolved once for both dev surfaces. */
  readonly panels: { readonly disabled: ReadonlySet<string> };
  /** The request-history ring, built from `config.dev.history`. */
  readonly history: DebugHistoryStore;
}
