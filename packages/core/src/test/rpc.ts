import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import type { AppContext, Db } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { Factories } from "./factories.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { appRouter } from "../rpc/router.js";
import { factoriesFor, userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

interface BaseRpcHarnessOptions {
  readonly hooks?: HookRegistry;
  readonly plugins?: PluginRegistry;
  readonly request?: Request;
}

interface AuthenticatedHarnessOptions extends BaseRpcHarnessOptions {
  readonly authAs: UserRole;
}

interface RpcHarnessBase<TUser extends User | null> {
  readonly db: TestDb;
  readonly hooks: HookRegistry;
  readonly plugins: PluginRegistry;
  readonly context: AppContext;
  readonly client: RouterClient<typeof appRouter>;
  readonly user: TUser;
  readonly factory: Factories;
}

type RpcHarness = RpcHarnessBase<User | null>;
type AuthenticatedRpcHarness = RpcHarnessBase<User>;

const noop = (): void => undefined;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function buildContext(
  db: Db,
  hooks: HookExecutor,
  plugins: PluginRegistry,
  request: Request,
): AppContext {
  return createAppContext({
    db,
    env: {} as AppContext["env"],
    request,
    hooks,
    plugins,
    logger: silentLogger,
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
  hooks: HookRegistry,
  plugins: PluginRegistry,
  request: Request,
  user: TUser,
): RpcHarnessBase<TUser> {
  const context = buildContext(db, hooks, plugins, request);
  const client = createRouterClient(appRouter, { context });
  return {
    db,
    hooks,
    plugins,
    context,
    client,
    user,
    factory: factoriesFor(db),
  };
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
  const hooks = options.hooks ?? new HookRegistry();
  const plugins = options.plugins ?? createPluginRegistry();

  if (!options.request && options.authAs) {
    const user = await userFactory
      .transient({ db })
      .create({ role: options.authAs });
    const request = await authenticatedRequest(db, user.id);
    return assemble(db, hooks, plugins, request, user);
  }

  const request = options.request ?? unauthenticatedRequest();
  return assemble<User | null>(db, hooks, plugins, request, null);
}
