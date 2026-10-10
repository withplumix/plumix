import type { RPCHandler } from "@orpc/server/fetch";

import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { PlumixAuthConfig } from "../auth/config.js";
import type { AuthMethodsSummary } from "../auth/contract/auth-methods.js";
import type { SessionPolicy } from "../auth/contract/sessions.js";
import type { PasskeyRuntimeConfig } from "../auth/passkey/config.js";
import type { CapabilityResolver } from "../auth/rbac.js";
import type {
  BlockRegistry,
  HtmlAllowlist,
  MarkSpec,
  ShortcodeRegistry,
} from "../blocks/index.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext } from "../context/app-context.js";
import type { DocumentManifest } from "../document-manifest.js";
import type { MailCatalogs } from "../mail/catalogs.js";
import type { DeclaredMails } from "../mail/declared.js";
import type { McpHandler } from "../mcp/dispatch.js";
import type {
  PluginRegistry,
  RegisteredRawRoute,
  RegisteredScheduledTask,
} from "../plugin/manifest.js";
import type { ContextExtensionEntry } from "../plugin/provides-context.js";
import type { RestDispatch } from "../rest/build-handler.js";
import type { RestRoute } from "../rest/rest-routes.js";
import type { RouteRule } from "../route/contract/intent.js";
import type { PublicRouteTable } from "../route/public-routes.js";
import type { CompiledRedirects } from "../route/redirects.js";
import type { AssetManifest } from "../route/render/asset-manifest.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";
import type { RenderEnv } from "../route/render/render-env.js";
import type { EnvInput } from "./contract/env-input.js";
import type { SchemaModule } from "./contract/slots.js";
import type { DevRuntime } from "./dev.js";
import { adminBarChrome } from "../admin-bar/component.js";
import { registerCoreAdminBarContributors } from "../admin-bar/core-contributors.js";
import { defaultAuthenticator } from "../auth/authenticator.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { getCapabilityResolver } from "../auth/rbac.js";
import { DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import {
  buildHtmlAllowlist,
  commitBlockVariations,
  coreBlocks,
  coreMarks,
  coreShortcodes,
  createBlockRegistry,
} from "../blocks/index.js";
import { registerCorePurgeInvalidator } from "../cdn/purge.js";
import * as coreSchema from "../db/schema/index.js";
import { debugBarChrome } from "../dev/debug-bar/component.js";
import { registerCoreDebugPanels } from "../dev/debug-panels/core-panels.js";
import { registerCoreErrorHints } from "../dev/server/hints/core-hints.js";
import { HookRegistry } from "../hooks/registry.js";
import { createMailCatalogs } from "../mail/catalogs.js";
import { declareMails } from "../mail/declared.js";
import { resolveImageRoleIndex } from "../plugin/image-roles.js";
import {
  collectContributedBlocks,
  createPluginRegistry,
} from "../plugin/manifest.js";
import { CORE_REST_ROUTES, routesOverlap } from "../rest/rest-routes.js";
import { compileRouteMap } from "../route/compile.js";
import { compilePublicRoutes } from "../route/public-routes.js";
import { assembleRedirects } from "../route/redirects.js";
import { createBlockCatalogs } from "../route/render/block-catalog.js";
import { CORE_RPC_NAMESPACES } from "../rpc/namespaces.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { registerCoreSearchHandlers } from "../search/register-core-handlers.js";
import { registerCoreSettings } from "../settings-core.js";
import { registerCoreTemplateDeps } from "../template-deps-core.js";
import { ThemeRegistrationError } from "../theme-errors.js";
import { validateDocumentManifest } from "../theme.js";
import { parseCron } from "./contract/cron.js";
import { AppBootError } from "./contract/errors.js";
import { createDevRuntime } from "./dev.js";
import { installPlugins } from "./install-plugins.js";
import { registerCoreScheduledTasks } from "./register-core-scheduled-tasks.js";
import { assembleShortcodeRegistry } from "./shortcode-registry.js";

export type { AuthMethodsSummary } from "../auth/contract/auth-methods.js";

/**
 * Pure, so a login page rendered from it never drifts from what the endpoints
 * accept.
 */
export function resolveAuthMethods(
  authConfig: PlumixAuthConfig,
): AuthMethodsSummary {
  const providers = authConfig.oauth?.providers ?? {};
  return {
    passkey: true,
    magicLink: authConfig.magicLink !== undefined,
    oauth: Object.entries(providers).map(([key, provider]) => ({
      key,
      label: provider.label,
    })),
  };
}

export interface PlumixApp {
  readonly config: PlumixConfig;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  /**
   * Memoized; deferred so the procedure graph stays off the public render cold
   * start.
   */
  readonly loadRpcHandler: () => Promise<RPCHandler<AppContext>>;
  /**
   * Memoized; deferred so `@orpc/openapi` stays off the public render cold
   * start.
   */
  readonly loadRestHandler: () => Promise<RestDispatch>;
  /**
   * Memoized; deferred so the MCP SDK stays off the public render cold start.
   */
  readonly loadMcpHandler: () => Promise<McpHandler>;
  /**
   * Sourced from `passkey.origin`; resolved per request into `ctx.origin`,
   * where `env` is available.
   */
  readonly origin: EnvInput<string>;
  /**
   * Every `ctx.dev` is this instance. `undefined` outside the dev gate, so its
   * presence is the dev-server signal.
   */
  readonly dev?: DevRuntime;
  readonly passkey: PasskeyRuntimeConfig;
  readonly sessionPolicy: SessionPolicy;
  /**
   * Defaults to the session-cookie guard; an operator override such as
   * `cfAccess()` replaces it.
   */
  readonly authenticator: RequestAuthenticator;
  /**
   * Whether non-passkey sign-in flows may mint the first admin on a fresh
   * deploy.
   */
  readonly bootstrapAllowed: boolean;
  /**
   * Projected auth methods for theme login pages and the admin login (via the
   * `auth.signInMethods` RPC); see {@link AuthMethodsSummary}.
   */
  readonly authMethods: AuthMethodsSummary;
  readonly schema: SchemaModule;
  /**
   * Sorted route map compiled once at `buildApp` from the plugin registry.
   * Module-scoped module-less equivalent: CF Worker isolates reuse this
   * across requests without re-derivation.
   */
  readonly routeMap: readonly RouteRule[];
  /** Compiled public-route redirects/410s, matched ahead of `routeMap`. */
  readonly redirects: CompiledRedirects;
  readonly rawRoutes: readonly RegisteredRawRoute[];
  /**
   * Plugin routes mounted at the site root, compiled at boot. Matched ahead of
   * the redirect table and the content route map; see {@link
   * compilePublicRoutes}.
   */
  readonly publicRoutes: PublicRouteTable;
  readonly capabilityResolver: CapabilityResolver;
  /**
   * Plugin-contributed AppContext entries from `extendAppContext`.
   * Runtime adapters spread these onto every per-request `AppContext`
   * via `createAppContext({ appContextExtensions })`.
   */
  readonly appContextExtensions: ReadonlyMap<string, ContextExtensionEntry>;
  /**
   * Plugin-contributed scheduled tasks from `registerScheduledTask`.
   * The handler's `scheduled` path iterates this list on every scheduled
   * invocation; `runScheduledTasks(app, ctx)` is the shared dispatch helper.
   */
  readonly scheduledTasks: readonly RegisteredScheduledTask[];
  /**
   * Merged block registry, built once at boot: `blocks/` core specs +
   * plugin contributions (`ctx.registerBlock(s)`) + theme blocks (the
   * `defineTheme` `blocks` field), aggregated by `collectContributedBlocks`.
   */
  readonly blocks: BlockRegistry;
  /**
   * Manifest only: rendering uses the hardcoded `renderInline` walker, not a
   * per-spec dispatch.
   */
  readonly marks: readonly MarkSpec[];
  /** Last-wins precedence: core < plugin < theme. */
  readonly shortcodes: ShortcodeRegistry;
  /**
   * Every declared mail by name — core's and each plugin's `mails` — with the
   * site's and the theme's overrides applied, checked once at boot.
   */
  readonly mails: DeclaredMails;
  /** Core's mail catalog under every plugin's, per locale, for `ctx.mail`. */
  readonly mailCatalogs: MailCatalogs;
  /**
   * Sanitizer allowlist the blocks that render stored HTML
   * (`core/html`, `core/rich-text`) are held to, built once from the
   * intrinsic baseline + `config.blocks.htmlAllowlist`. It reaches those
   * blocks through `HtmlAllowlistProvider`, never as a prop.
   */
  readonly htmlAllowlist: HtmlAllowlist;
  /**
   * After the `theme:document` filter chain, resolved once at boot and
   * deep-frozen.
   */
  readonly document: DocumentManifest;
  /** Empty in dev, where Vite serves source, and without a full Vite build. */
  readonly assetManifest: AssetManifest;
  /**
   * The bundled render environment the dispatcher threads per render; see
   * {@link RenderEnv}.
   */
  readonly renderEnv: RenderEnv;
}

// Resolved by the Vite plugin from virtual modules and injected by the
// generated entry.
interface RuntimeContext {
  readonly assetManifest?: AssetManifest;
  readonly pluginCatalogs?: PluginCatalogs;
}

export async function buildApp(
  config: PlumixConfig,
  runtime: RuntimeContext = {},
): Promise<PlumixApp> {
  const hooks = new HookRegistry();
  registerCoreAdminBarContributors(hooks);
  if (process.env.PLUMIX_DEV) {
    registerCoreDebugPanels(hooks);
    registerCoreErrorHints(hooks);
  }
  // `PLUMIX_DEV` must be set before `buildApp`; without a dev object, capture
  // no-ops.
  const dev = process.env.PLUMIX_DEV ? createDevRuntime(config.dev) : undefined;
  registerCoreSearchHandlers(hooks);
  // Unconditional: the request memo drops what a write announced whether or
  // not a cdn is configured, and without one the purge half accumulates
  // nothing.
  registerCorePurgeInvalidator(hooks);
  const seededRegistry = createPluginRegistry(config.routes);
  registerCoreLookupAdapters(seededRegistry);
  registerCoreTemplateDeps(seededRegistry);
  registerCoreSettings(seededRegistry);
  registerCoreScheduledTasks(seededRegistry);
  const { registry, appContextExtensions } = await installPlugins({
    hooks,
    plugins: config.plugins,
    registry: seededRegistry,
  });

  // Defense-in-depth for JS callers — the type already requires `theme`,
  // but a hand-rolled config can still drop it.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS callers
  if (!config.theme) {
    throw ThemeRegistrationError.missingTheme();
  }

  // Before core aggregates anything, so a subscriber's own registrations still
  // land in every registry assembled below.
  await hooks.doAction("theme:ready", config.theme);
  // Every role is registered by now, so the index built here is the complete
  // one the request path reads, and a misdeclared role fails this boot.
  resolveImageRoleIndex(registry);

  const schema: Record<string, unknown> = { ...coreSchema };
  const origin = new Map<string, string>();
  for (const key of Object.keys(coreSchema)) origin.set(key, "core");
  for (const plugin of config.plugins) {
    if (!plugin.schema) continue;
    for (const [key, value] of Object.entries(plugin.schema)) {
      const previous = origin.get(key);
      if (previous !== undefined) {
        throw AppBootError.schemaExportConflict({
          pluginId: plugin.id,
          schemaKey: key,
          previousOwner: previous,
        });
      }
      origin.set(key, plugin.id);
      schema[key] = value;
    }
  }

  // Against the light name set, so the router graph stays deferred.
  // `Object.hasOwn` also rejects "constructor", which would shadow a router
  // member.
  for (const pluginId of registry.rpcRouters.keys()) {
    if (
      CORE_RPC_NAMESPACES.has(pluginId) ||
      Object.hasOwn(Object.prototype, pluginId)
    ) {
      throw AppBootError.pluginIdCollidesWithCoreRpcNamespace({ pluginId });
    }
  }

  // Overlap, not equality: the matcher prefers static segments, so a literal
  // path could shadow a param route.
  const seenRestRoutes: { pluginId: string; route: RestRoute }[] = [];
  for (const resource of registry.restResources) {
    const route = { method: resource.method, path: resource.path };
    if (CORE_REST_ROUTES.some((core) => routesOverlap(route, core))) {
      throw AppBootError.restResourceShadowsCore({
        pluginId: resource.pluginId,
        method: resource.method,
        path: resource.path,
      });
    }
    const clash = seenRestRoutes.find((seen) =>
      routesOverlap(route, seen.route),
    );
    if (clash) {
      throw AppBootError.restResourcePathConflict({
        pluginId: resource.pluginId,
        otherPluginId: clash.pluginId,
        method: resource.method,
        path: resource.path,
      });
    }
    seenRestRoutes.push({ pluginId: resource.pluginId, route });
  }

  // Nothing downstream can tell an unfireable cron from one not yet due, so
  // fail at boot rather than never run.
  for (const task of registry.scheduledTasks) {
    if (task.cron === undefined) continue;
    try {
      parseCron(task.cron);
    } catch (error) {
      throw AppBootError.invalidScheduledTaskCron({
        pluginId: task.registeredBy,
        taskId: task.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passkey = resolvePasskeyConfig(config.auth.passkey);
  const authMethods = resolveAuthMethods(config.auth);
  const sessionPolicy = config.auth.sessions ?? DEFAULT_SESSION_POLICY;
  const authenticator =
    config.auth.authenticator ?? defaultAuthenticator(sessionPolicy);
  const bootstrapAllowed = config.auth.bootstrapVia === "first-method-wins";

  // Last-write-wins gives core < plugin < theme.
  const blocks = createBlockRegistry([
    ...coreBlocks,
    ...collectContributedBlocks(
      registry.blockSpecs.values(),
      config.theme.blocks,
    ),
  ]);
  // Boot validation: every variation's `innerBlocks` is walked against
  // the committed registry. Unknown block names and undeclared attrs
  // throw structured errors here rather than producing render junk later.
  commitBlockVariations(blocks);

  const pluginMarkSpecs = Array.from(registry.markSpecs.values()).map(
    ({ spec }) => spec,
  );
  const marks: readonly MarkSpec[] = [...coreMarks, ...pluginMarkSpecs];

  const pluginShortcodeSpecs = Array.from(registry.shortcodeSpecs.values()).map(
    ({ spec }) => spec,
  );
  const shortcodes = assembleShortcodeRegistry(
    coreShortcodes,
    pluginShortcodeSpecs,
    config.theme.shortcodes ?? [],
  );

  const htmlAllowlist = buildHtmlAllowlist(
    blocks,
    config.blocks?.htmlAllowlist,
  );

  const document = await resolveDocumentManifest(hooks, config.theme.document);

  const assetManifest = runtime.assetManifest ?? {};
  const renderEnv: RenderEnv = {
    theme: config.theme,
    document,
    templateDeps: registry.templateDeps,
    assetManifest,
    htmlAllowlist,
    blockCatalogs: createBlockCatalogs(runtime.pluginCatalogs),
    chrome: {
      adminBar: adminBarChrome,
      debugBar: process.env.PLUMIX_DEV ? debugBarChrome : undefined,
    },
  };

  // Memoized so the heavy router module + handler construction happen once per
  // isolate, on the first RPC request — never on the public render cold path.
  let rpcHandler: Promise<RPCHandler<AppContext>> | undefined;
  const loadRpcHandler = (): Promise<RPCHandler<AppContext>> =>
    (rpcHandler ??= import("../rpc/build-handler.js").then((m) =>
      m.buildRpcHandler(registry.rpcRouters),
    ));

  let restHandler: Promise<RestDispatch> | undefined;
  const loadRestHandler = (): Promise<RestDispatch> =>
    (restHandler ??= import("../rest/build-handler.js").then((m) =>
      m.buildRestDispatcher(registry, config.api?.cors),
    ));

  let mcpHandler: Promise<McpHandler> | undefined;
  const loadMcpHandler = (): Promise<McpHandler> =>
    (mcpHandler ??= import("../mcp/dispatch.js").then(
      (m) => m.handleMcpRequest,
    ));

  return {
    config,
    hooks,
    plugins: registry,
    loadRpcHandler,
    loadRestHandler,
    loadMcpHandler,
    origin: passkey.origin,
    dev,
    passkey,
    sessionPolicy,
    authenticator,
    bootstrapAllowed,
    authMethods,
    schema,
    routeMap: compileRouteMap(registry),
    redirects: assembleRedirects({
      config: config.redirects,
      plugin: registry.redirects,
      theme: config.theme.redirects,
    }),
    rawRoutes: registry.rawRoutes,
    publicRoutes: compilePublicRoutes(registry.publicRoutes),
    capabilityResolver: getCapabilityResolver(registry),
    appContextExtensions,
    scheduledTasks: registry.scheduledTasks,
    blocks,
    marks,
    shortcodes,
    mails: declareMails({
      plugins: config.plugins,
      theme: config.theme.mail,
      site: config.mail?.overrides,
    }),
    mailCatalogs: createMailCatalogs(runtime.pluginCatalogs),
    htmlAllowlist,
    document,
    assetManifest,
    renderEnv,
  };
}

// Deep-frozen: a shallow freeze would let a plugin mutate `app.document.meta`
// and corrupt later requests.
async function resolveDocumentManifest(
  hooks: HookRegistry,
  themeManifest: DocumentManifest | undefined,
): Promise<DocumentManifest> {
  const seed: DocumentManifest = themeManifest ?? {};
  const merged = await hooks.applyFilter("theme:document", seed);
  validateDocumentManifest(merged);
  return deepFreezeManifest(merged);
}

function deepFreezeManifest(manifest: DocumentManifest): DocumentManifest {
  manifest.link?.forEach((entry) => Object.freeze(entry));
  manifest.meta?.forEach((entry) => Object.freeze(entry));
  manifest.script?.forEach((entry) => Object.freeze(entry));
  if (manifest.link) Object.freeze(manifest.link);
  if (manifest.meta) Object.freeze(manifest.meta);
  if (manifest.script) Object.freeze(manifest.script);
  if (manifest.html) Object.freeze(manifest.html);
  if (manifest.body) Object.freeze(manifest.body);
  return Object.freeze(manifest);
}
