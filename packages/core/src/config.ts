import type { MailerInput } from "./auth/contract/mailer.js";
import type { HtmlAllowlistOverride } from "./blocks/index.js";
import type { RemotePattern } from "./blocks/renderer/index.js";
import type { AuthenticatedUser } from "./context/app-context.js";
import type { PlumixAuthConfig } from "./context/auth-config.js";
import type {
  DebugBarInput,
  DebugHistoryStoreOptions,
  DebugPanelsInput,
} from "./context/dev-runtime.js";
import type { RuntimeAdapter } from "./context/runtime-adapter.js";
import type { TelemetryConfig } from "./context/telemetry.js";
import type {
  I18nInputFor,
  LocaleResolverOverrideFor,
  ResolvedI18nFor,
} from "./i18n/locale-registry.js";
import type { PluginDescriptor } from "./plugin/define.js";
import type {
  FrameworkRoutes,
  FrameworkRoutesInput,
} from "./route/contract/framework-routes.js";
import type { RedirectRule } from "./route/contract/redirects.js";
import type {
  CdnProvider,
  DatabaseAdapter,
  ImageDelivery,
  KV,
  ObjectStorage,
} from "./runtime/contract/slots.js";
import type { ThemeDescriptor } from "./theme.js";

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

// The locale config with its override handed the request's user.
export type I18nInput = I18nInputFor<AuthenticatedUser>;
export type LocaleResolverOverride =
  LocaleResolverOverrideFor<AuthenticatedUser>;
export type ResolvedI18n = ResolvedI18nFor<AuthenticatedUser>;

/**
 * A Vite config object as the consumer's `vite.config.ts` writes it, kept
 * structural so core carries no Vite dependency. Not JSON: the values include
 * plugin instances, resolver functions and RegExps that no serializer round
 * trips.
 */
export type ViteUserConfig = Readonly<Record<string, unknown>>;

/**
 * Development-only configuration. Its members are the dev debug layers: the
 * overlay (`bar`), the panel vocabulary both dev surfaces render (`panels`),
 * and the captured request-history ring (`history`). Composed here rather than
 * under `dev/` so no module in that tree has to name all of its layers to
 * declare the shape — which is what kept the panel denylist homeless while it
 * was spelled as bar config (#2425).
 *
 * The whole block is carried through raw, like
 * {@link PlumixConfigInput.mcp}, and interpreted only inside dev-gated
 * modules, which are tree-shaken from production builds.
 */
export interface DevInput {
  /** The dev debug bar. `false` suppresses it; defaults on in development. */
  readonly bar?: DebugBarInput;
  /**
   * Which debug panels this site shows, keyed by panel id — `{ database:
   * false }` hides one. Read by the bar *and* by the request-history read
   * routes, which render stored snapshots with no bar in sight.
   */
  readonly panels?: DebugPanelsInput;
  /**
   * Bounds on the dev request-history ring the debug bar, its read routes and
   * the two dev MCP tools all share. The ring belongs to the app, which is
   * what makes these reachable at all (#2442).
   */
  readonly history?: DebugHistoryStoreOptions;
}

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
   * Public read-through CDN. Optional and default-off: with no `cdn`
   * slot, every public page renders live. The provider shipped today is
   * `cloudflare({ ttl, zoneId, purgeToken })` from `plumix/cdn/cloudflare`,
   * which works from any host behind the zone; it disables itself when the
   * deploy lacks the credentials needed to cache safely (e.g. on
   * `workers.dev`).
   */
  readonly cdn?: CdnProvider;
  /**
   * Outbound email transport. Implementations conform to the `Mailer`
   * interface from `@plumix/core` — one method, swap in any provider
   * (Resend, Postmark, SES, SMTP). Shared by every feature that sends
   * mail (magic-link today; future invite-email, password-reset,
   * plugin-defined notifications), so plugin authors and operators
   * configure the transport once at the top level. `consoleMailer()`
   * is the dev default.
   */
  readonly mailer?: MailerInput;
  /**
   * The site's theme. Optional: a site that registers none falls back to
   * the built-in `welcomeTheme`, which renders a self-contained
   * welcome screen on the public site until a real theme is added.
   */
  readonly theme?: ThemeDescriptor;
  readonly plugins?: readonly AnyPluginDescriptor[];
  readonly i18n?: I18nInput;
  /**
   * The site's own public-route redirects (301/302/307/308) and `410 Gone`
   * rules — typically legacy path→path moves at an SEO cutover. Merged ahead
   * of plugin- and theme-contributed redirects (config wins on a tie). See
   * {@link RedirectRule}.
   */
  readonly redirects?: readonly RedirectRule[];
  /**
   * Which of core's framework routes the site keeps, keyed by page kind. Every
   * family is on by default; one set to `false` is never compiled, so its URLs
   * 404 unless something else answers them. Root pagination (`/page/N`) is not
   * switchable.
   *
   * @example
   * routes: { date: false, author: false }
   */
  readonly routes?: FrameworkRoutesInput;
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
   * Development-only configuration: the debug bar and its panels. Carried
   * through raw (like {@link mcp}) and interpreted only inside dev-gated
   * modules, which are tree-shaken from production builds.
   */
  readonly dev?: DevInput;
  /**
   * Telemetry consumers, registered once here. Each consumer head-samples
   * per request and receives a serializable snapshot post-response; with no
   * consumers the collector stays a no-op and production pays nothing. The
   * dev debug bar registers itself as the first consumer automatically.
   */
  readonly telemetry?: TelemetryConfig;
  /**
   * Block-system configuration. `htmlAllowlist` feeds the allowlist built
   * at boot for blocks that render stored HTML, which both the public
   * render and the editor canvas sanitize against. Note `extraTags` and
   * `extraAttributes` merge with the baseline while `schemes` and
   * `allowProtocolRelative` replace it. Under all four is a floor no
   * override can widen past: a denylist of tags, of `on*` / `style`
   * attributes, and of script-capable URL schemes. Future block-level
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
  readonly vite?: ViteUserConfig;
}

// The slots `plumix()` resolves. Every other slot reaches `PlumixConfig` as
// the operator wrote it, so a new pass-through slot is declared only on the
// input.
interface ResolvedSlots {
  readonly theme: ThemeDescriptor;
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly i18n: ResolvedI18n;
  readonly redirects: readonly RedirectRule[];
  /** Every framework route family settled, `true` where the site left it unset. */
  readonly routes: FrameworkRoutes;
  /** Normalized subdirectory prefix (`""` for a root deployment). */
  readonly basePath: string;
}

export interface PlumixConfig
  extends Omit<PlumixConfigInput, keyof ResolvedSlots>, ResolvedSlots {}
