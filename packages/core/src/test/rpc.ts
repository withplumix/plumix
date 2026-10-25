import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { PlumixAuthConfig } from "../auth/config.js";
import type { BlockRegistry, MarkSpec } from "../blocks/index.js";
import type { PlumixConfig } from "../config.js";
import type { AppContext, Db } from "../context/app-context.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { EventDefinition } from "../hooks/define.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { ActionArgs, ActionName } from "../hooks/types.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { AuthMethodsSummary } from "../runtime/app.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { TestConfigInput } from "./config.js";
import type { Factories } from "./factories.js";
import type { MailFake } from "./mail-fake.js";
import type { ActionSpy, BoundFilterSpy, EventSpy } from "./spies.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { coreAuthMethods } from "../auth/core-methods.js";
import { declareAuthMethods } from "../auth/declared-methods.js";
import { resolvePasskeyConfig } from "../auth/passkey/config.js";
import { createSession, DEFAULT_SESSION_POLICY } from "../auth/sessions.js";
import { withUser } from "../auth/with-user.js";
import { resolveAllowedBlocks } from "../blocks/allowed-blocks.js";
import { coreBlocks, coreMarks, createBlockRegistry } from "../blocks/index.js";
import { resolveStylePolicy } from "../blocks/styles/style-policy.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry as HookRegistryImpl } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { appRouter } from "../rpc/router.js";
import { resolveAuthMethods } from "../runtime/app.js";
import { mailerOrFake, testConfig } from "./config.js";
import { silentLogger } from "./context.js";
import { factoriesFor, userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";
import { fakeMail } from "./mail-fake.js";
import { bindFilterSpy, spyAction, spyEvent } from "./spies.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export interface BaseRpcHarnessOptions {
  readonly hooks?: HookRegistry;
  /**
   * Plugin registry seed. Anything contributed via `ctx.registerBlock` /
   * `ctx.registerMark` lands in the validator's merged registries —
   * pass a registry produced by `installPlugins` to exercise plugin
   * block / mark content end-to-end through `entry.update`.
   */
  readonly plugins?: PluginRegistry;
  readonly request?: Request;
  /**
   * Runtime environment bindings (KV, R2, etc.) — exposed on `h.env`.
   * Empty object by default; override for tests that need specific bindings.
   */
  readonly env?: PlumixEnv;
  /**
   * Auth config the harness projects onto `ctx.authMethods`, the way
   * `buildApp` does. Pass `auth({ passkey, magicLink, oauth })` when
   * exercising `auth.signInMethods`; omitted, the context reports no methods.
   */
  readonly auth?: PlumixAuthConfig;
  /**
   * Override the default session-cookie authenticator. Tests for
   * external-IdP-style flows (cfAccess, custom guards) pass an
   * instance here; the RPC `authenticated` middleware delegates to it.
   */
  readonly authenticator?: RequestAuthenticator;
  /**
   * Config slots — `mailer`, `auth: { magicLink: { siteName } }` and the
   * rest — resolved through `plumix()` into the context's `config`.
   */
  readonly config?: TestConfigInput;
}

export interface AuthenticatedHarnessOptions extends BaseRpcHarnessOptions {
  readonly authAs: UserRole;
}

export interface RpcHarnessBase<TUser extends User | null> {
  readonly db: TestDb;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  readonly env: PlumixEnv;
  readonly context: AppContext;
  readonly client: RouterClient<typeof appRouter>;
  readonly user: TUser;
  readonly factory: Factories;
  /**
   * Records every mail `ctx.mail.send` sent. With no `mailer` in `config`, it
   * is the transport too; `mailer: undefined` leaves the site with none.
   */
  readonly mail: MailFake;
  readonly spyAction: <TName extends ActionName>(
    name: TName,
  ) => ActionSpy<ActionArgs<TName>>;
  readonly spyFilter: BoundFilterSpy;
  /** Record every payload the event is emitted with. */
  readonly spyEvent: <TPayload>(
    event: EventDefinition<TPayload>,
  ) => EventSpy<TPayload>;
  /**
   * A harness bound to the given user or a fresh one of the role, sharing db,
   * hooks, plugins and env so state survives the swap.
   */
  readonly actingAs: (
    userOrRole: User | UserRole,
  ) => Promise<AuthenticatedRpcHarness>;
}

export type RpcHarness = RpcHarnessBase<User | null>;
export type AuthenticatedRpcHarness = RpcHarnessBase<User>;

/**
 * The context `authenticated` hands a handler; `h.context` is the base one, and
 * read surfaces answer per viewer.
 */
export function authedCtx(
  h: AuthenticatedRpcHarness,
  tokenScopes: readonly string[] | null = null,
): AppContext {
  return withUser(h.context, h.user, tokenScopes);
}

function buildContext(
  db: Db,
  env: PlumixEnv,
  hooks: HookRegistry,
  plugins: PluginRegistry,
  blocks: BlockRegistry,
  marks: readonly MarkSpec[],
  request: Request,
  authMethods: AuthMethodsSummary | undefined,
  authenticator: RequestAuthenticator | undefined,
  config: PlumixConfig,
  mail: MailFake,
): AppContext {
  return createAppContext({
    db,
    env,
    request,
    hooks,
    plugins,
    blocks,
    allowedBlocks: new Set(
      resolveAllowedBlocks(blocks, {
        themeBlocks: config.theme.blocks ?? [],
        allowedBlocks: config.theme.allowedBlocks,
      }),
    ),
    stylePolicy: resolveStylePolicy(config.theme),
    marks,
    logger: silentLogger,
    authMethods,
    authenticator,
    config,
    onMailSent: mail.record,
  });
}

function unauthenticatedRequest(): Request {
  return new Request("https://cms.example/_plumix/rpc", { method: "POST" });
}

async function authenticatedRequest(
  db: TestDb,
  userId: number,
): Promise<Request> {
  const { token } = await createSession(db, { userId });
  return new Request("https://cms.example/_plumix/rpc", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

function assemble<TUser extends User | null>(
  db: TestDb,
  env: PlumixEnv,
  hooks: HookRegistry,
  plugins: PluginRegistry,
  blocks: BlockRegistry,
  marks: readonly MarkSpec[],
  request: Request,
  user: TUser,
  authMethods: AuthMethodsSummary | undefined,
  authenticator: RequestAuthenticator | undefined,
  config: PlumixConfig,
  mail: MailFake,
): RpcHarnessBase<TUser> {
  const context = buildContext(
    db,
    env,
    hooks,
    plugins,
    blocks,
    marks,
    request,
    authMethods,
    authenticator,
    config,
    mail,
  );
  const client = createRouterClient(appRouter, { context });

  const harness: RpcHarnessBase<TUser> = {
    db,
    env,
    hooks,
    plugins,
    context,
    client,
    user,
    factory: factoriesFor(db),
    mail,
    spyAction: (name) => spyAction(hooks, name),
    spyFilter: bindFilterSpy(hooks),
    spyEvent: (event) => spyEvent(hooks, event),
    actingAs: async (userOrRole) => {
      const targetUser: User =
        typeof userOrRole === "string"
          ? await userFactory.transient({ db }).create({ role: userOrRole })
          : userOrRole;
      const req = await authenticatedRequest(db, targetUser.id);
      return assemble(
        db,
        env,
        hooks,
        plugins,
        blocks,
        marks,
        req,
        targetUser,
        authMethods,
        authenticator,
        config,
        mail,
      );
    },
  };
  return harness;
}

/** Core's listing for `auth`, as `buildApp` projects it. */
function listAuthMethods(
  config: PlumixConfig,
  auth: PlumixAuthConfig,
): AuthMethodsSummary {
  const core = coreAuthMethods({
    config: { ...config, auth },
    passkey: resolvePasskeyConfig(auth.passkey),
    sessionPolicy: DEFAULT_SESSION_POLICY,
  });
  return resolveAuthMethods(declareAuthMethods({ core, plugins: [] }), auth);
}

export function createRpcHarness(
  options: AuthenticatedHarnessOptions,
): Promise<AuthenticatedRpcHarness>;
export function createRpcHarness(
  options?: BaseRpcHarnessOptions,
): Promise<RpcHarness>;
export async function createRpcHarness(
  options: BaseRpcHarnessOptions & { authAs?: UserRole } = {},
): Promise<RpcHarness> {
  const db = await createTestDb();
  const hooks = options.hooks ?? new HookRegistryImpl();
  const plugins = options.plugins ?? createPluginRegistry();
  const env = options.env ?? {};
  const mail = fakeMail();
  const config = testConfig(mailerOrFake(options.config, mail));
  const authMethods = options.auth && listAuthMethods(config, options.auth);
  // Build the same default registries `buildApp` would so the RPC
  // harness exercises validation against the real core specs.
  const pluginBlockSpecs = Array.from(plugins.blockSpecs.values()).map(
    ({ spec }) => spec,
  );
  const pluginMarkSpecs = Array.from(plugins.markSpecs.values()).map(
    ({ spec }) => spec,
  );
  const blocks = createBlockRegistry([...coreBlocks, ...pluginBlockSpecs]);
  const marks: readonly MarkSpec[] = [...coreMarks, ...pluginMarkSpecs];

  if (!options.request && options.authAs) {
    const user = await userFactory
      .transient({ db })
      .create({ role: options.authAs });
    const request = await authenticatedRequest(db, user.id);
    return assemble(
      db,
      env,
      hooks,
      plugins,
      blocks,
      marks,
      request,
      user,
      authMethods,
      options.authenticator,
      config,
      mail,
    );
  }

  const request = options.request ?? unauthenticatedRequest();
  return assemble<User | null>(
    db,
    env,
    hooks,
    plugins,
    blocks,
    marks,
    request,
    null,
    authMethods,
    options.authenticator,
    config,
    mail,
  );
}
