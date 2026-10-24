import type { ReactNode } from "react";

import type { Label } from "../i18n/label.js";
import type { JsonValue } from "../json.js";
import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { AppContext } from "./app-context.js";
import type { TelemetryRecord, TelemetrySpan } from "./telemetry.js";

// Declared here, not under `dev/`, so the context and config types can name
// them without importing up into a surface.

/** Users write the position as a string literal, so it needs no public name. */
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

/** A mail a request sent under `plumix dev`, as its history records it. */
export interface RecordedMail {
  readonly name: string;
  readonly props: JsonValue;
  readonly to: string;
  readonly locale: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * A mail `plumix dev` caught instead of sending, because the site has no
 * `mailer`. Inert JSON, like a history entry.
 */
export interface CaughtMail extends RecordedMail {
  readonly id: string;
  /** When it was caught (epoch ms). */
  readonly at: number;
}

/** The mail `plumix dev` caught, bounded by the same `config.dev.history`. */
export interface CaughtMailStore {
  /** Copies and truncates the mail; evicts the oldest past the cap. */
  save(mail: CaughtMail): void;
  /** Every caught mail, newest first. */
  get(): readonly CaughtMail[];
  clear(): void;
}

/**
 * Augment with `og: true` to make a plugin's panel nameable in `dev.panels`;
 * only registered ids are, so a typo is a compile error.
 *
 * ```ts
 * declare module "plumix" {
 *   interface DebugPanelRegistry {
 *     og: true;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface DebugPanelRegistry extends Record<CoreDebugPanelId, true> {}

/**
 * A runtime list so a test can hold it equal to what `registerCoreDebugPanels`
 * contributes.
 */
export const CORE_DEBUG_PANEL_IDS = [
  "app",
  "request",
  "database",
  "template",
  "timeline",
  "mail",
] as const;

type CoreDebugPanelId = (typeof CORE_DEBUG_PANEL_IDS)[number];

type DebugPanelId = keyof DebugPanelRegistry;

/** An absent key shows the panel. */
export type DebugPanelsInput = Partial<Readonly<Record<DebugPanelId, boolean>>>;

/**
 * A debug-bar panel, added with `registerDebugPanel`. `render` runs
 * server-side over a serializable {@link DebugSnapshot}, never live request
 * context.
 */
export interface DebugPanel {
  readonly id: string;
  readonly title: Label;
  /** Ascending; unset sorts after ordered panels (see DEFAULT_PANEL_ORDER). */
  readonly order?: number;
  /**
   * Rendered in its own SSR pass, so outer React context providers are not
   * visible; read request data off the snapshot, not `useContext`.
   */
  readonly render: (snapshot: DebugSnapshot) => ReactNode;
}

/** A section of the dev error page, added with `registerErrorPanel`. */
export interface DevErrorPanel {
  readonly id: string;
  /** Section heading; a dev-only English string, like a hint's title. */
  readonly title: string;
  /**
   * Ascending; unset sorts after ordered panels (see collectDevErrorPanels).
   */
  readonly order?: number;
  /** Whether this error gets the section; unset shows it for every error. */
  readonly visible?: (error: unknown) => boolean;
  /** Rendered in isolation to inert HTML. */
  readonly render: (error: unknown, ctx: AppContext) => ReactNode;
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

/** A dev error-page hint, added with `registerErrorHint`. */
export interface DevErrorHintRegistration extends DevErrorHint {
  readonly id: string;
  /** Whether the hint applies to this error. */
  readonly matches: (error: unknown) => boolean;
}

/** `null` is core's own. */
export type DevRegistered<T> = T & { readonly registeredBy: string | null };

/** `config.dev`, resolved once per app and shared by every request. */
export interface DevRuntime {
  /** `config.dev.bar`, normalized. */
  readonly bar: NormalizedDebugBar;
  /** `config.dev.panels`, resolved once for both dev surfaces. */
  readonly panels: { readonly disabled: ReadonlySet<string> };
  /** The request-history ring, built from `config.dev.history`. */
  readonly history: DebugHistoryStore;
  /** Mail caught on a site with no `mailer`, built from `config.dev.history`. */
  readonly mail: CaughtMailStore;
  /** Every registered debug panel by id, in registration order. */
  readonly debugPanels: ReadonlyMap<string, DevRegistered<DebugPanel>>;
  /** Every registered dev error-page panel by id, in registration order. */
  readonly errorPanels: ReadonlyMap<string, DevRegistered<DevErrorPanel>>;
  /** Every registered dev error-page hint by id, in registration order. */
  readonly errorHints: ReadonlyMap<
    string,
    DevRegistered<DevErrorHintRegistration>
  >;
}

/** What boot writes registrations into. */
export interface MutableDevRuntime extends DevRuntime {
  readonly debugPanels: Map<string, DevRegistered<DebugPanel>>;
  readonly errorPanels: Map<string, DevRegistered<DevErrorPanel>>;
  readonly errorHints: Map<string, DevRegistered<DevErrorHintRegistration>>;
}
