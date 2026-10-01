import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { TelemetryRecord, TelemetrySpan } from "./telemetry.js";

// The dev runtime every request carries as `ctx.dev`, with the capture shapes
// it names, and the `config.dev` input it resolves from. Declared here, not
// under `dev/`, so the context and config types can name them without reaching
// up into a surface; `dev/` implements them.

// Users write the position as a string literal, so it needs no public name.
type DebugBarPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

/**
 * `dev.bar`: the overlay itself. Only what the bar alone reads lives here —
 * which panels it shows is `dev.panels`, read identically by the history read
 * routes, a surface with no bar in it.
 *
 * `false` is the only spelling of off; there is no `enabled` key, because two
 * spellings of one thing is how the slot this replaced grew four settings with
 * three meanings.
 */
export type DebugBarInput =
  | boolean
  | {
      readonly position?: DebugBarPosition;
      readonly defaultOpen?: boolean;
    };

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

export interface DebugHistoryStoreOptions {
  /** Ring capacity; drop-oldest past it. */
  readonly maxEntries?: number;
  /** Total-byte budget across the ring; evict oldest past it (newest kept). */
  readonly maxTotalBytes?: number;
  /** Individual string cap; longer values are truncated at capture. */
  readonly maxStringLength?: number;
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
 * Every debug panel a site can name in `dev.panels`. Core seeds its five;
 * a plugin adds its own from the module that registers the panel:
 *
 * ```ts
 * declare module "plumix" {
 *   interface DebugPanelRegistry {
 *     og: true;
 *   }
 * }
 * ```
 *
 * The extension point is open and the configuration surface is closed:
 * {@link DebugPanel.id} stays `string`, so anyone may contribute a panel
 * through the `debug:panels` filter, but only a registered id is *nameable*
 * in config — which is what turns a mistyped panel name from a silent no-op
 * into a compile error. A panel whose plugin ships no augmentation is still
 * removable through the filter.
 *
 * The value type carries nothing; the key is the whole declaration.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface DebugPanelRegistry extends Record<CoreDebugPanelId, true> {}

/**
 * The ids of the panels core registers. A runtime list rather than five
 * interface members so a test can hold it equal to what `registerCoreDebugPanels`
 * actually contributes — a registry key with no panel behind it would be the
 * same silent no-op this registry exists to rule out.
 */
export const CORE_DEBUG_PANEL_IDS = [
  "app",
  "request",
  "database",
  "template",
  "timeline",
] as const;

type CoreDebugPanelId = (typeof CORE_DEBUG_PANEL_IDS)[number];

type DebugPanelId = keyof DebugPanelRegistry;

/**
 * `dev.panels`: which panels this site shows. An absent key shows the panel,
 * so the default is every panel a plugin contributed rather than a list the
 * author has to maintain as they install things.
 */
export type DebugPanelsInput = Partial<Readonly<Record<DebugPanelId, boolean>>>;

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
