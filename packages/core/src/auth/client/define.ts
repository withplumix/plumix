import type { AuthResult } from "./result.js";

export interface RedirectOptions {
  /** App-relative (`/account`); the kernel adds the base path. */
  readonly redirectTo?: string;
}

/**
 * What a method's client half works through, bound to its mount at
 * `<basePath>/_plumix/auth/<name>/`.
 */
export interface AuthMethodClientKernel {
  /** The URL of `route` under the method's mount, `redirectTo` on its query. */
  readonly url: (route?: string, options?: RedirectOptions) => string;
  /**
   * POSTs `body` as JSON with the CSRF header. A sign-in answer refreshes the
   * session, and navigates to the server's `redirectTo` only when the call
   * passed one.
   */
  readonly post: <T>(
    route: string,
    body?: unknown,
    options?: RedirectOptions,
  ) => Promise<AuthResult<T>>;
  /**
   * Calls the RPC `procedure` as the session's user, resolving the answer
   * out of its envelope.
   */
  readonly rpc: <T>(
    procedure: string,
    input?: unknown,
  ) => Promise<AuthResult<T>>;
  /** A full-page navigation, for a flow that leaves the site. */
  readonly navigate: (url: string) => void;
  /** A failure the browser hit itself, such as a cancelled prompt. */
  readonly fail: (code: string) => AuthResult<never>;
}

/** Every action resolves `{ data, error }`, as `signIn` does. */
export type AuthMethodActions = Readonly<
  Record<string, (...args: never[]) => Promise<AuthResult<unknown>>>
>;

export interface AuthMethodClient<
  TName extends string = string,
  TActions extends AuthMethodActions = AuthMethodActions,
> {
  readonly name: TName;
  readonly create: (kernel: AuthMethodClientKernel) => TActions;
}

/**
 * The client half of `defineAuthMethod`: `signIn` appears as
 * `authClient.signIn.<camelCase name>`, every other action under
 * `authClient.<camelCase name>`.
 */
export function defineAuthMethodClient<
  const TName extends string,
  TActions extends AuthMethodActions,
>(
  name: TName,
  create: (kernel: AuthMethodClientKernel) => TActions,
): AuthMethodClient<TName, TActions> {
  return { name, create };
}
