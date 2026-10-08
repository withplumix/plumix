import type {
  AppContext,
  AuthenticatedUser,
} from "../../context/app-context.js";
import type { RequestMemo } from "../../context/memo.js";
import { canAccessAdmin } from "../../access/contract/rbac.js";
import { resolveLocale } from "../../i18n/resolve-locale.js";

// What the render phase decided about its reader (ADR 0030). Keyed on the
// request's memo, like the page tags: core derives contexts by spreading, and
// the memo is the one object every derivation carries.
interface RenderVerdict {
  personal: boolean;
  readonly adminBarViewer: AuthenticatedUser | null;
}

const verdicts = new WeakMap<RequestMemo, RenderVerdict>();

/**
 * The context the render phase runs with. Reading `user` or `tokenScopes`, or
 * calling `auth.can()`, marks the render personal (ADR 0030): it is then never
 * stored in a shared segment's entry. Two things are decided here, before the
 * render, rather than by a read: a staff principal gets the admin bar, and a
 * principal whose locale differs from the one the request resolves to without
 * them gets their own page. Both make the render personal from the start.
 *
 * A request with no principal has nothing to track, so it keeps its context.
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

/** Whether this request's render read the principal, or was personal from the start. */
export function renderIsPersonal(ctx: Pick<AppContext, "memo">): boolean {
  return verdicts.get(ctx.memo)?.personal === true;
}

/**
 * The staff principal the admin bar renders for, decided before the render,
 * or `null` when the page carries no bar. A render no render phase began for
 * (an error page for a failure before the handoff) follows the principal
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
