import type { HtmlAllowlistOverride } from "@plumix/blocks";
import type { RemotePattern } from "@plumix/blocks/renderer";

import type { PlumixAuthConfig } from "./auth/config.js";
import type { Mailer } from "./auth/mailer/types.js";
import type { I18nInput, ResolvedI18n } from "./i18n/locale-registry.js";
import type { PluginDescriptor } from "./plugin/define.js";
import type { RuntimeAdapter } from "./runtime/adapter.js";
import type {
  CacheProvider,
  DatabaseAdapter,
  ImageDelivery,
  KV,
  ObjectStorage,
} from "./runtime/slots.js";
import type { ThemeDescriptor } from "./theme.js";
import { normalizeBasePath } from "./base-path.js";
import { resolveLocales } from "./i18n/locale-registry.js";
import { welcomeTheme } from "./welcome-theme.js";

/**
 * Re-exported from `./theme.js` so existing `import { Theme } from
 * "@plumix/core"` call sites keep working. Prefer `ThemeDescriptor`
 * directly in new code.
 */
export type Theme = ThemeDescriptor;

// Heterogeneous arrays of plugins/adapters need the framework-side slot typed
// with `any` so each caller's concrete generic is accepted via bivariance.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyPluginDescriptor = PluginDescriptor<any>;
export type AnyDatabaseAdapter = DatabaseAdapter<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Shared on/off switch for an external interface surface (MCP today, the
 * REST API next). Default-off: a surface is mounted only when its config
 * sets `enabled: true`, so the dispatcher can 404 before importing the
 * surface's handler graph at all.
 */
export interface InterfaceToggle {
  readonly enabled?: boolean;
}

export function interfaceEnabled(toggle: InterfaceToggle | undefined): boolean {
  return toggle?.enabled === true;
}

/**
 * Cross-origin policy for the REST API's anonymous reads. Default-closed: with
 * no `cors`, no `Access-Control-Allow-Origin` is ever emitted. `origins: "*"`
 * opens anonymous reads to any origin; an array allows only those. PAT-authed
 * responses are never CORS-exposed regardless, so a token can't be abused from
 * browser JS cross-origin.
 */
export interface ApiCorsConfig {
  readonly origins?: readonly string[] | "*";
}

export interface ApiConfig extends InterfaceToggle {
  readonly cors?: ApiCorsConfig;
}

export interface PlumixConfigInput {
  readonly runtime: RuntimeAdapter;
  readonly database: AnyDatabaseAdapter;
  readonly auth: PlumixAuthConfig;
  readonly storage?: ObjectStorage;
  readonly imageDelivery?: ImageDelivery;
  readonly kv?: KV;
  /**
   * Public read-through edge cache. Optional and default-off: with no `cache`
   * slot, every public page renders live. The canonical provider is
   * `edge({ ttl, staleWhileRevalidate })` from `@plumix/runtime-cloudflare`;
   * it disables itself when the deploy lacks the zone credentials needed to
   * cache safely (e.g. on `workers.dev`).
   */
  readonly cache?: CacheProvider;
  /**
   * Outbound email transport. Implementations conform to the `Mailer`
   * interface from `@plumix/core` — one method, swap in any provider
   * (Resend, Postmark, SES, SMTP). Shared by every feature that sends
   * mail (magic-link today; future invite-email, password-reset,
   * plugin-defined notifications), so plugin authors and operators
   * configure the transport once at the top level. `consoleMailer()`
   * is the dev default.
   */
  readonly mailer?: Mailer;
  /**
   * The site's theme. Optional: a site that registers none falls back to
   * the built-in {@link welcomeTheme}, which renders a self-contained
   * welcome screen on the public site until a real theme is added.
   */
  readonly theme?: ThemeDescriptor;
  readonly plugins?: readonly AnyPluginDescriptor[];
  readonly i18n?: I18nInput;
  /**
   * Serve the whole site under a subdirectory (`example.com/custom-directory/*`)
   * — set this when a reverse proxy mounts plumix below the domain root.
   * Mirrors Next's `basePath` / Nuxt's `app.baseURL`: a leading-slash prefix
   * with no trailing slash. Normalized leniently (`docs`, `/docs/` both work);
   * the default `""` is a root deployment. Path-only — it never touches
   * `auth.passkey.origin`, which stays scheme+host for WebAuthn.
   */
  readonly basePath?: string;
  /**
   * Model Context Protocol endpoint at `/_plumix/mcp`. Default-off; set
   * `{ enabled: true }` to mount it.
   */
  readonly mcp?: InterfaceToggle;
  /**
   * Public REST API + OpenAPI spec at `/_plumix/api/v1/`. Default-off; set
   * `{ enabled: true }` to mount it.
   */
  readonly api?: ApiConfig;
  /**
   * Block-system configuration. Today only exposes the operator-
   * configurable `core/html` allowlist override; future block-level
   * settings (per-block disable, etc.) slot in here too.
   */
  readonly blocks?: {
    readonly htmlAllowlist?: HtmlAllowlistOverride;
  };
  /**
   * Image handling for the `<Image>` theme component. `remotePatterns` is the
   * allowlist of remote hosts `<Image>` may optimize; same-origin sources are
   * always allowed, and unlisted remote sources render unoptimized.
   */
  readonly images?: {
    readonly remotePatterns?: readonly RemotePattern[];
  };
  /**
   * Passthrough merged with plumix's own Vite config via `mergeConfig`.
   * Structural so core stays Vite-dep-free.
   */
  readonly vite?: Readonly<Record<string, unknown>>;
}

export interface PlumixConfig {
  readonly runtime: RuntimeAdapter;
  readonly database: AnyDatabaseAdapter;
  readonly auth: PlumixAuthConfig;
  readonly storage?: ObjectStorage;
  readonly imageDelivery?: ImageDelivery;
  readonly kv?: KV;
  readonly cache?: CacheProvider;
  readonly mailer?: Mailer;
  readonly theme: ThemeDescriptor;
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly i18n: ResolvedI18n;
  /** Normalized subdirectory prefix (`""` for a root deployment). */
  readonly basePath: string;
  readonly mcp?: InterfaceToggle;
  readonly api?: ApiConfig;
  readonly blocks?: {
    readonly htmlAllowlist?: HtmlAllowlistOverride;
  };
  readonly images?: {
    readonly remotePatterns?: readonly RemotePattern[];
  };
  readonly vite?: Readonly<Record<string, unknown>>;
}

export function plumix(config: PlumixConfigInput): PlumixConfig {
  // Cross-field invariant: features that require email (magic-link
  // today) need a configured mailer at the top level. Surface this at
  // app build time rather than letting it crash on the first request.
  if (config.auth.magicLink && !config.mailer) {
    // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
    throw new Error(
      "plumix(): `auth.magicLink` requires a top-level `mailer` " +
        "(use `consoleMailer()` for dev or pass your own `Mailer`).",
    );
  }
  return {
    runtime: config.runtime,
    database: config.database,
    auth: config.auth,
    storage: config.storage,
    imageDelivery: config.imageDelivery,
    kv: config.kv,
    cache: config.cache,
    mailer: config.mailer,
    theme: config.theme ?? welcomeTheme,
    plugins: config.plugins ?? [],
    i18n: resolveLocales(
      config.i18n ?? { defaultLocale: "en", locales: ["en"] },
    ),
    basePath: normalizeBasePath(config.basePath),
    mcp: config.mcp,
    api: config.api,
    blocks: config.blocks,
    images: config.images,
    vite: config.vite,
  };
}

export { plumix as defineConfig };
