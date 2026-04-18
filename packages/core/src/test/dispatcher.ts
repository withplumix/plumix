import type { AppContext } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { PlumixApp } from "../runtime/app.js";
import { auth } from "../auth/config.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { plumix } from "../config.js";
import { createAppContext } from "../context/app.js";
import { buildApp } from "../runtime/app.js";
import { createPlumixDispatcher } from "../runtime/dispatcher.js";
import { userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub", { status: 500 }),
};

const stubDatabase = {
  kind: "test",
  connect: () => ({ db: {} }),
};

interface DispatcherHarness {
  readonly db: TestDb;
  readonly app: PlumixApp;
  readonly dispatch: (
    request: Request,
    user?: User | null,
  ) => Promise<Response>;
  readonly authenticateRequest: (
    request: Request,
    userId: number,
  ) => Promise<Request>;
  readonly seedUser: (role?: UserRole) => Promise<User>;
}

const noop = (): void => undefined;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function withRequest(
  app: PlumixApp,
  db: TestDb,
  request: Request,
  user: User | null,
): AppContext {
  return createAppContext({
    db,
    env: {} as AppContext["env"],
    request,
    hooks: app.hooks,
    plugins: app.plugins,
    logger: silentLogger,
    user: user
      ? { id: user.id, email: user.email, role: user.role }
      : undefined,
  });
}

export async function createDispatcherHarness(): Promise<DispatcherHarness> {
  const db = await createTestDb();
  const config = plumix({
    runtime: stubAdapter,
    database: stubDatabase,
    auth: auth({
      passkey: {
        rpName: "Plumix Test",
        rpId: "cms.example",
        origin: "https://cms.example",
      },
    }),
  });
  const app = await buildApp(config);
  const dispatcher = createPlumixDispatcher(app);

  return {
    db,
    app,
    dispatch: async (request, user = null) => {
      const ctx = withRequest(app, db, request, user);
      return dispatcher(ctx);
    },
    authenticateRequest: async (request, userId) => {
      const { token } = await createSession(db, { userId });
      const headers = new Headers(request.headers);
      headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return new Request(request, { headers });
    },
    seedUser: async (role = "subscriber") =>
      userFactory.transient({ db }).create({ role }),
  };
}

export function plumixRequest(path: string, init: RequestInit = {}): Request {
  const url = path.startsWith("http") ? path : `https://cms.example${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("x-plumix-request")) {
    headers.set("x-plumix-request", "1");
  }
  return new Request(url, { ...init, headers });
}
