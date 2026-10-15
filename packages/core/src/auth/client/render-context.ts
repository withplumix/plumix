import type { AuthMethodsSummary } from "../contract/auth-methods.js";
import type { Session, SessionUser } from "./session.js";
import { PENDING } from "./session.js";

/** The listed sign-in methods and OAuth providers, as the render has them. */
export type AuthMethods = AuthMethodsSummary;

export interface AuthRenderContext {
  /** `""` for a root deployment. */
  readonly basePath: string;
  readonly methods: AuthMethods;
  /**
   * Called only when a component asks for the session, since reading the
   * principal makes the render personal (ADR 0030).
   */
  readonly user: () => SessionUser | null;
}

/** What the server embeds for the browser: the context, plus any session read. */
export interface EmbeddedAuthContext {
  readonly basePath: string;
  readonly methods: AuthMethods;
  readonly session?: Session;
}

const NO_METHODS: AuthMethods = { methods: [], oauth: [] };

interface Frame {
  readonly context: AuthRenderContext;
  session?: Session;
}

/**
 * Safe as module state because `renderToString` is synchronous: no other
 * request's render runs between setting and restoring it.
 */
let rendering: Frame | null = null;
let seeded: EmbeddedAuthContext | null = null;

/**
 * Runs a synchronous server render with `context` as `authClient`'s, and
 * reports the session it read, which the page then embeds so hydration sees
 * the same.
 */
export function renderWithAuthContext<T>(
  context: AuthRenderContext,
  render: () => T,
): { readonly rendered: T; readonly session?: Session } {
  const previous = rendering;
  const frame: Frame = { context };
  rendering = frame;
  try {
    const rendered = render();
    return frame.session === undefined
      ? { rendered }
      : { rendered, session: frame.session };
  } finally {
    rendering = previous;
  }
}

/** For a page no server render produced, such as the admin. */
export function seedAuthContext(context: EmbeddedAuthContext): void {
  seeded = context;
}

/** The attribute of the script the islands bootstrap embeds the context in. */
export const AUTH_CONTEXT_ATTRIBUTE = "data-plumix-auth";

function embedded(): EmbeddedAuthContext | null {
  if (seeded !== null || typeof document === "undefined") return seeded;
  const script = document.querySelector(`script[${AUTH_CONTEXT_ATTRIBUTE}]`);
  if (script?.textContent) {
    seeded = JSON.parse(script.textContent) as EmbeddedAuthContext;
  }
  return seeded;
}

export function currentBasePath(): string {
  return rendering?.context.basePath ?? embedded()?.basePath ?? "";
}

export function currentAuthMethods(): AuthMethods {
  return rendering?.context.methods ?? embedded()?.methods ?? NO_METHODS;
}

/** The session the browser starts from: the one the server rendered with. */
export function seededSession(): Session {
  return embedded()?.session ?? PENDING;
}

/** During a server render, the render's session; otherwise the seeded one. */
export function renderedSession(): Session {
  const frame = rendering;
  if (frame === null) return seededSession();
  frame.session ??= { user: frame.context.user(), isPending: false };
  return frame.session;
}
