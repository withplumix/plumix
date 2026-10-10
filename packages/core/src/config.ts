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
import type { MailConfig } from "./mail/contract/registry.js";
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
 * Structural so core carries no Vite dependency. Not JSON: values include
 * plugin instances, resolver functions and RegExps.
 */
export type ViteUserConfig = Readonly<Record<string, unknown>>;

/**
 * Carried through raw and interpreted only inside dev-gated modules, which
 * are tree-shaken from production builds.
 */
export interface DevInput {
  /** The dev debug bar. `false` suppresses it; defaults on in development. */
  readonly bar?: DebugBarInput;
  /**
   * `{ database: false }` hides one. Also read by the request-history routes,
   * which render stored snapshots with no bar.
   */
  readonly panels?: DebugPanelsInput;
  /** Shared by the debug bar, its read routes and the dev MCP tools. */
  readonly history?: DebugHistoryStoreOptions;
}

/**
 * Default-off, so the dispatcher can 404 before importing the surface's
 * handler graph.
 */
export interface InterfaceToggle {
  readonly enabled?: boolean;
}

export function interfaceEnabled(toggle: InterfaceToggle | undefined): boolean {
  return toggle?.enabled === true;
}

/**
 * Default-closed: no `cors`, no `Access-Control-Allow-Origin`. Token-authed
 * responses are never CORS-exposed, so a token can't be abused cross-origin.
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
   * Default-off: with no `cdn`, every public page renders live.
   * `cloudflare()` disables itself when the deploy lacks the credentials to
   * cache safely.
   */
  readonly cdn?: CdnProvider;
  /**
   * Shared by every feature that sends mail. `consoleMailer()` is the dev
   * default.
   */
  readonly mailer?: MailerInput;
  /**
   * `overrides` replaces a declared mail's `subject`, `text` and `html` by
   * name, winning over theme and owner. Overriding an undeclared name fails
   * the boot.
   */
  readonly mail?: MailConfig;
  /**
   * Without one the site falls back to `welcomeTheme`, a self-contained
   * welcome screen.
   */
  readonly theme?: ThemeDescriptor;
  readonly plugins?: readonly AnyPluginDescriptor[];
  readonly i18n?: I18nInput;
  /** Merged ahead of plugin and theme redirects; config wins on a tie. */
  readonly redirects?: readonly RedirectRule[];
  /**
   * A family set to `false` is never compiled, so its URLs 404 unless
   * something else answers them. Root pagination is not switchable.
   *
   * @example
   * routes: { date: false, author: false }
   */
  readonly routes?: FrameworkRoutesInput;
  /**
   * Leading slash, no trailing slash; normalized leniently. Never touches
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
   * With no consumers the collector is a no-op and production pays nothing.
   * The dev debug bar registers itself automatically.
   */
  readonly telemetry?: TelemetryConfig;
  /**
   * `extraTags` and `extraAttributes` merge with the baseline; `schemes` and
   * `allowProtocolRelative` replace it. No override widens past the denylist
   * floor.
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
  readonly routes: FrameworkRoutes;
  /** `""` for a root deployment. */
  readonly basePath: string;
}

export interface PlumixConfig
  extends Omit<PlumixConfigInput, keyof ResolvedSlots>, ResolvedSlots {}
