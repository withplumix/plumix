import type { AppContext } from "../context/app-context.js";
import type { RequestAuthenticator } from "../context/authenticator.js";
import type { RequestMemo } from "../context/memo.js";
import { declareThrough } from "../cdn/contract/page-tags.js";
import { ANONYMOUS_PRINCIPAL } from "../context/anonymous-principal.js";
import { rebindSettings } from "../context/settings-namespace.js";
import { rebindDispatch } from "../events-and-filters/dispatch.js";
import { resolveLocale } from "../i18n/resolve-locale.js";

/**
 * Answers as nobody, for output that must not depend on who asked. Its
 * authenticator resolves no one, so nothing below it sees the cookie
 * `ctx.request` keeps.
 */
export function anonymousContext(ctx: AppContext): AppContext {
  // Copied by descriptor, not spread: spreading a render phase's context reads
  // its principal accessors and marks the render personal (ADR 0030).
  const anonymous = Object.create(
    Object.getPrototypeOf(ctx) as object | null,
    Object.getOwnPropertyDescriptors(ctx),
  ) as AppContext;
  const { events, filters } = rebindDispatch(ctx, () => anonymous);
  return Object.defineProperties(anonymous, {
    ...Object.getOwnPropertyDescriptors(ANONYMOUS_PRINCIPAL),
    locale: {
      value: resolveLocale({
        request: ctx.request,
        user: null,
        i18n: ctx.config.i18n,
      }),
      enumerable: true,
    },
    authenticator: { value: anonymousAuthenticator, enumerable: true },
    access: { value: null, enumerable: true, writable: true },
    memo: { value: namespaced(ctx.memo, ANONYMOUS_MEMO), enumerable: true },
    settings: {
      value: rebindSettings(ctx.settings, () => anonymous),
      enumerable: true,
    },
    events: { value: events, enumerable: true },
    filters: { value: filters, enumerable: true },
  });
}

/**
 * `hasSession` must be explicit, or `requestHasSession` sniffs the cookie
 * still on the request.
 */
const anonymousAuthenticator: RequestAuthenticator = {
  authenticate: () => Promise.resolve(null),
  hasSession: () => false,
};

const ANONYMOUS_MEMO = "anonymous:";

/**
 * Shares the store and its invalidation, so a write still drops the entry, and
 * the request's page tags, so what it reads still tags the response.
 */
function namespaced(memo: RequestMemo, prefix: string): RequestMemo {
  const reader = Object.assign(
    <T>(key: string, load: () => Promise<T>, tags?: readonly string[]) =>
      memo(`${prefix}${key}`, load, tags),
    { invalidate: (tags: readonly string[]) => memo.invalidate(tags) },
  );
  declareThrough(reader, memo);
  return reader;
}
