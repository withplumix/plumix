import type { AppContext } from "../context/app-context.js";
import type { RequestMemo } from "../context/memo.js";
import { resolveLocale } from "../i18n/resolve-locale.js";

/**
 * For public output built from someone else's request: a rule asked through it
 * answers for anonymous visitors. `ctx.request` keeps the cookie, so
 * re-authenticating from it defeats this.
 */
export function anonymousContext(ctx: AppContext): AppContext {
  // Copied by descriptor, not spread: spreading a render phase's context reads
  // its principal accessors and marks the render personal (ADR 0030).
  const anonymous = Object.create(
    Object.getPrototypeOf(ctx) as object | null,
    Object.getOwnPropertyDescriptors(ctx),
  ) as AppContext;
  return Object.defineProperties(anonymous, {
    user: { value: null, enumerable: true },
    tokenScopes: { value: null, enumerable: true },
    auth: { value: { can: () => false }, enumerable: true },
    locale: {
      value: resolveLocale({
        request: ctx.request,
        user: null,
        i18n: ctx.config.i18n,
      }),
      enumerable: true,
    },
    access: { value: null, enumerable: true, writable: true },
    memo: { value: namespaced(ctx.memo, ANONYMOUS_MEMO), enumerable: true },
  });
}

const ANONYMOUS_MEMO = "anonymous:";

/** Shares the store and its invalidation, so a write still drops the entry. */
function namespaced(memo: RequestMemo, prefix: string): RequestMemo {
  return Object.assign(
    <T>(key: string, load: () => Promise<T>, tags?: readonly string[]) =>
      memo(`${prefix}${key}`, load, tags),
    { invalidate: (tags: readonly string[]) => memo.invalidate(tags) },
  );
}
