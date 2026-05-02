import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import type { OAuthProviderKey } from "../auth/oauth/types.js";
import type { AppContext, Db } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { HookExecutor, HookRegistry } from "../hooks/registry.js";
import type {
  ActionArgs,
  ActionName,
  FilterInput,
  FilterName,
  FilterRest,
} from "../hooks/types.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { PlumixEnv } from "../runtime/bindings.js";
import type { Factories } from "./factories.js";
import type { ActionSpy, FilterSpy } from "./spies.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry as HookRegistryImpl } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { appRouter } from "../rpc/router.js";
import { factoriesFor, userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";
import { spyAction, spyFilter } from "./spies.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export interface BaseRpcHarnessOptions {
  readonly hooks?: HookRegistry;
  readonly plugins?: PluginRegistry;
  readonly request?: Request;
  /**
   * Runtime environment bindings (KV, R2, etc.) — exposed on `h.env`.
   * Empty object by default; override for tests that need specific bindings.
   */
  readonly env?: PlumixEnv;
  /**
   * Provider keys the harness should report on `ctx.oauthProviders`. Pass
   * `["github"]` etc. when exercising the auth.oauthProviders procedure;
   * default `[]` matches a passkey-only deploy.
   */
  readonly oauthProviders?: readonly OAuthProviderKey[];
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
  readonly spyAction: <TName extends ActionName>(
    name: TName,
  ) => ActionSpy<ActionArgs<TName>>;
  readonly spyFilter: <TName extends FilterName>(
    name: TName,
  ) => FilterSpy<FilterInput<TName>, FilterRest<TName>>;
  /**
   * Return a new harness bound to the given user (or freshly seeded user of
   * the given role). The underlying db / hooks / plugins / env are shared,
   * so state survives the swap — use this for tests that exercise multiple
   * roles in a single scenario.
   */
  readonly actingAs: (
    userOrRole: User | UserRole,
  ) => Promise<AuthenticatedRpcHarness>;
}

export type RpcHarness = RpcHarnessBase<User | null>;
export type AuthenticatedRpcHarness = RpcHarnessBase<User>;

const noop = (): void => undefined;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function buildContext(
  db: Db,
  env: PlumixEnv,
  hooks: HookExecutor,
  plugins: PluginRegistry,
  request: Request,
  oauthProviders: readonly OAuthProviderKey[],
): AppContext {
  return createAppContext({
    db,
    env,
    request,
    hooks,
    plugins,
    logger: silentLogger,
    oauthProviders,
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
  request: Request,
  user: TUser,
  oauthProviders: readonly OAuthProviderKey[],
): RpcHarnessBase<TUser> {
  const context = buildContext(
    db,
    env,
    hooks,
    plugins,
    request,
    oauthProviders,
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
    spyAction: (name) => spyAction(hooks, name),
    spyFilter: (name) => spyFilter(hooks, name),
    actingAs: async (userOrRole) => {
      const targetUser: User =
        typeof userOrRole === "string"
          ? await userFactory.transient({ db }).create({ role: userOrRole })
          : userOrRole;
      const req = await authenticatedRequest(db, targetUser.id);
      return assemble(db, env, hooks, plugins, req, targetUser, oauthProviders);
    },
  };
  return harness;
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
  const oauthProviders = options.oauthProviders ?? [];

  if (!options.request && options.authAs) {
    const user = await userFactory
      .transient({ db })
      .create({ role: options.authAs });
    const request = await authenticatedRequest(db, user.id);
    return assemble(db, env, hooks, plugins, request, user, oauthProviders);
  }

  const request = options.request ?? unauthenticatedRequest();
  return assemble<User | null>(
    db,
    env,
    hooks,
    plugins,
    request,
    null,
    oauthProviders,
  );
}
