import { useSyncExternalStore } from "react";
import * as v from "valibot";

import type { JsonValue } from "../../json.js";
import type {
  AuthMethodActions,
  AuthMethodClient,
  AuthMethodClientKernel,
  RedirectOptions,
} from "./define.js";
import type { AuthClient, AuthUrlTarget, SignedOut } from "./registry.js";
import type { AuthMethods } from "./render-context.js";
import type { AuthResult } from "./result.js";
import type { Session, SessionStore } from "./session.js";
import { withBasePath } from "../../base-path.js";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../../csrf-header.js";
import { CORE_METHOD_CLIENTS } from "./core-methods.js";
import { failure, success } from "./result.js";
import {
  createSessionStore,
  PENDING,
  sessionEnvelopeSchema,
} from "./session.js";

const AUTH_PREFIX = "/_plumix/auth";

/**
 * Raw envelope, not `@orpc/client`, which would put the RPC client in every
 * island. Safe while the output stays JSON-native.
 */
const SESSION_PATH = "/_plumix/rpc/auth/session";

/** The kernel's answer to a fetch that signed someone in. */
const signedInSchema = v.object({
  userId: v.number(),
  redirectTo: v.optional(v.string()),
});

const signedOutSchema = v.object({ redirectTo: v.nullish(v.string()) });

const errorSchema = v.object({ error: v.string() });

type Action = (...args: readonly unknown[]) => Promise<AuthResult<unknown>>;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface AuthClientEnv {
  /** Read on every call, so a call made before the context exists still lands. */
  readonly basePath: () => string;
  readonly fetch?: Fetch;
  readonly navigate?: (url: string) => void;
  /** The session the page was rendered with; pending when it carries none. */
  readonly session?: () => Session;
  /** What a server render or hydration reads; defaults to `session`. */
  readonly renderedSession?: () => Session;
  readonly methods?: () => AuthMethods;
}

interface CreatedAuthClient {
  readonly authClient: AuthClient;
  readonly registerAuthMethodClients: (
    clients: readonly AuthMethodClient[],
  ) => void;
  readonly session: SessionStore;
}

export function createAuthClient(env: AuthClientEnv): CreatedAuthClient {
  const request: Fetch = env.fetch ?? ((url, init) => fetch(url, init));
  const navigate =
    env.navigate ??
    ((url: string) => {
      window.location.assign(url);
    });
  const halves = new Map<string, AuthMethodActions>();

  const withRedirect = (path: string, options: RedirectOptions = {}) => {
    const { redirectTo } = options;
    if (redirectTo === undefined) return path;
    const query = new URLSearchParams({
      redirectTo: withBasePath(redirectTo, env.basePath()),
    });
    return `${path}?${query.toString()}`;
  };

  const authUrl = (path: string, options?: RedirectOptions) =>
    withRedirect(`${env.basePath()}${AUTH_PREFIX}/${path}`, options);

  async function send(
    url: string,
    body: unknown,
  ): Promise<AuthResult<JsonValue>> {
    let response: Response;
    try {
      response = await request(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      return failure("network_error");
    }
    let payload: JsonValue;
    try {
      payload = (await response.json()) as JsonValue;
    } catch {
      return failure("unknown");
    }
    if (!response.ok) {
      const refusal = v.safeParse(errorSchema, payload);
      return failure(refusal.success ? refusal.output.error : "unknown");
    }
    return success(payload);
  }

  const seed = env.session ?? (() => PENDING);
  const session = createSessionStore(async () => {
    const result = await send(`${env.basePath()}${SESSION_PATH}`, {
      json: {},
    });
    const envelope = v.safeParse(sessionEnvelopeSchema, result.data);
    return envelope.success ? envelope.output.json.user : null;
  }, seed);

  async function post<T>(
    path: string,
    body: unknown,
    options: RedirectOptions = {},
  ): Promise<AuthResult<T>> {
    const result = await send(authUrl(path, options), body);
    const signedIn = v.safeParse(signedInSchema, result.data);
    if (signedIn.success) {
      await session.refresh();
      // Only on request: without one, the page stays and `useSession` updates.
      const { redirectTo } = signedIn.output;
      if (options.redirectTo !== undefined && redirectTo !== undefined) {
        navigate(redirectTo);
      }
    }
    // Safety: the half names the answer its own route gives; the kernel only
    // decodes the sign-in and error shapes it acts on.
    return result as AuthResult<T>;
  }

  const kernelFor = (name: string): AuthMethodClientKernel => ({
    url: (route = "", options) => authUrl(`${name}/${route}`, options),
    post: (route, body, options) => post(`${name}/${route}`, body, options),
    navigate,
    fail: failure,
  });

  function registerAuthMethodClients(
    clients: readonly AuthMethodClient[],
  ): void {
    for (const client of clients) {
      halves.set(camelCase(client.name), client.create(kernelFor(client.name)));
    }
  }

  // Looked up when called, so a half registered after it was read runs.
  const action =
    (method: string, name: string): Action =>
    (...args) => {
      const run = halves.get(method)?.[name];
      if (run === undefined) {
        return Promise.resolve(failure("method_not_registered"));
      }
      // Safety: the registry entry for this name types the caller's arguments
      // as the half's own action takes them.
      return (run as Action)(...args);
    };

  const actionsOf = (method: string): object =>
    new Proxy(
      {},
      {
        get: (_, name) =>
          typeof name === "string" ? action(method, name) : undefined,
      },
    );

  async function signOut(
    options: RedirectOptions = {},
  ): Promise<AuthResult<SignedOut>> {
    const result = await send(authUrl("signout", options), undefined);
    if (result.error) return result;
    await session.refresh();
    const answer = v.safeParse(signedOutSchema, result.data);
    const redirectTo = answer.success
      ? (answer.output.redirectTo ?? null)
      : null;
    if (options.redirectTo !== undefined && redirectTo !== null) {
      navigate(redirectTo);
    }
    return success({ redirectTo });
  }

  const kernelApi = {
    signOut,
    useSession: (): Session =>
      useSyncExternalStore(
        session.subscribe,
        session.read,
        env.renderedSession ?? seed,
      ),
    useAuthMethods: (): AuthMethods =>
      env.methods?.() ?? { methods: [], oauth: [] },
    url: (target: AuthUrlTarget, options?: RedirectOptions) =>
      target === "signOut"
        ? authUrl("signout", options)
        : authUrl(`${target.method}/${target.route ?? ""}`, options),
    signIn: new Proxy(
      {},
      {
        get: (_, method) =>
          typeof method === "string" ? action(method, "signIn") : undefined,
      },
    ),
  };

  // Safety: the proxy answers every member `AuthClient` types: the kernel's
  // own, and each mounted half's actions, looked up when called.
  const authClient = new Proxy(kernelApi, {
    get: (target, key) => {
      if (typeof key !== "string" || key === "then") return undefined;
      if (key in target) return target[key as keyof typeof target];
      return actionsOf(key);
    },
  }) as unknown as AuthClient;

  registerAuthMethodClients(CORE_METHOD_CLIENTS);
  return { authClient, registerAuthMethodClients, session };
}

/** `magic-link` → `magicLink`. */
export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}
