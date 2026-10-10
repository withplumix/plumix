import type {
  AppContext,
  AuthenticatedUser,
} from "../../context/app-context.js";
import type { RequestMemo } from "../../context/memo.js";
import { canAccessAdmin } from "../../access/contract/rbac.js";
import { resolveLocale } from "../../i18n/resolve-locale.js";

// Keyed on the memo: derived contexts are spreads, and the memo is the one
// object every derivation carries.
interface RenderVerdict {
  personal: boolean;
  readonly adminBarViewer: AuthenticatedUser | null;
}

const verdicts = new WeakMap<RequestMemo, RenderVerdict>();

/**
 * Reading `user` or `tokenScopes`, or calling `auth.can()`, marks the render
 * personal so it is never shared-cached. A staff admin bar or a
 * principal-specific locale makes it personal up front.
 */
export function trackPrincipalReads(ctx: AppContext): AppContext {
  const user = ctx.user;
  if (user === null) return ctx;
  const adminBarViewer = staffViewer(user);
  const verdict: RenderVerdict = {
    personal: adminBarViewer !== null || localeIsPersonal(ctx),
    adminBarViewer,
  };
  verdicts.set(ctx.memo, verdict);
  const mark = () => {
    verdict.personal = true;
  };
  return {
    ...ctx,
    get user() {
      mark();
      return user;
    },
    get tokenScopes() {
      mark();
      return ctx.tokenScopes;
    },
    auth: {
      can: (capability) => {
        mark();
        return ctx.auth.can(capability);
      },
    },
  };
}

// The staff check the admin shell makes (#2814): the bar has nothing to offer
// anyone else.
function staffViewer(user: AuthenticatedUser): AuthenticatedUser | null {
  return canAccessAdmin(user.role) ? user : null;
}

// The context's locale was resolved with the principal; the request alone may
// resolve to another, through the site's `i18n.resolveLocale` override.
function localeIsPersonal(ctx: AppContext): boolean {
  const anonymous = resolveLocale({
    request: ctx.request,
    user: null,
    i18n: ctx.config.i18n,
  });
  return anonymous.code !== ctx.locale.code;
}

/**
 * Whether this request's render read the principal, or was personal from the
 * start.
 */
export function renderIsPersonal(ctx: Pick<AppContext, "memo">): boolean {
  return verdicts.get(ctx.memo)?.personal === true;
}

/**
 * Outside a render phase (an error before the handoff) follows the principal
 * directly; such a page is never stored.
 */
export function adminBarViewer(
  ctx: Pick<AppContext, "memo" | "user">,
): AuthenticatedUser | null {
  const verdict = verdicts.get(ctx.memo);
  if (verdict !== undefined) return verdict.adminBarViewer;
  const user = ctx.user;
  return user === null ? null : staffViewer(user);
}
