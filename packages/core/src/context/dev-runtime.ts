import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { TelemetryRecord, TelemetrySpan } from "./telemetry.js";

// Declared here, not under `dev/`, so the context and config types can name
// them without importing up into a surface.

// Users write the position as a string literal, so it needs no public name.
type DebugBarPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

/**
 * `false` is the only spelling of off. Panel choice lives in `dev.panels`,
 * which the history routes read too.
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
 * A small JSON-serializable slice, never the raw config or registry, so a
 * stored snapshot never pins the request graph.
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
 * Panels render HTML from this JSON, never the reverse, so a stored request
 * replays like a live one.
 */
export interface DebugSnapshot {
  readonly context: DebugContext;
  readonly spans: readonly TelemetrySpan[];
  readonly records: Readonly<Record<string, readonly TelemetryRecord[]>>;
}

/**
 * Inert JSON: never pins a live `ctx`, `Request`, connection or closure. `id`
 * is the request id.
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
 * Bounded and transport-agnostic, because several dev surfaces read it
 * unchanged.
 */
export interface DebugHistoryStore {
  /**
   * Deep-copies and truncates the snapshot; evicts the oldest entries past the
   * caps.
   */
  save(entry: DebugHistoryEntry): void;
  /** The stored entry with this request id, or undefined. */
  find(id: string): DebugHistoryEntry | undefined;
  /** Every stored entry, newest first. */
  get(): readonly DebugHistoryEntry[];
}

/**
 * Augment with `og: true` to make a plugin's panel nameable in `dev.panels`;
 * only registered ids are, so a typo is a compile error.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface DebugPanelRegistry extends Record<CoreDebugPanelId, true> {}

// A runtime list so a test can hold it equal to what `registerCoreDebugPanels`
// contributes.
export const CORE_DEBUG_PANEL_IDS = [
  "app",
  "request",
  "database",
  "template",
  "timeline",
] as const;

type CoreDebugPanelId = (typeof CORE_DEBUG_PANEL_IDS)[number];

type DebugPanelId = keyof DebugPanelRegistry;

/** An absent key shows the panel. */
export type DebugPanelsInput = Partial<Readonly<Record<DebugPanelId, boolean>>>;

/** `config.dev`, resolved once per app and shared by every request. */
export interface DevRuntime {
  /** `config.dev.bar`, normalized. */
  readonly bar: NormalizedDebugBar;
  /** `config.dev.panels`, resolved once for both dev surfaces. */
  readonly panels: { readonly disabled: ReadonlySet<string> };
  /** The request-history ring, built from `config.dev.history`. */
  readonly history: DebugHistoryStore;
}
