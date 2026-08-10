/**
 * Public-route redirects and 410 Gone. A precedence-ordered list of rules,
 * each mapping a request URL to a redirect target (301/302/307/308) or a
 * `gone` (410). Matched by the dispatcher ahead of the content route map, so a
 * redirect shadows a would-be content page. Rules are contributed by the site
 * (`config.redirects`), plugins (`registerRedirects`), and the theme
 * (`redirects` on the descriptor) — see {@link assembleRedirects}.
 */

export type RedirectStatus = 301 | 302 | 307 | 308;

/** The outcome of matching a request URL against the redirect rules. */
export type RedirectResolution =
  | {
      readonly kind: "redirect";
      readonly location: string;
      readonly status: RedirectStatus;
    }
  | { readonly kind: "gone" };

/** What a rule (static or dynamic) yields on a match, before normalization. */
export type RedirectTarget =
  | {
      readonly to: string;
      readonly status?: RedirectStatus;
      /**
       * Append the request's query string to `to` (unless `to` carries its own
       * `?…`). Defaults to `true` — the migration-friendly default, matching a
       * CDN "preserve query string" toggle. Set `false` to redirect to exactly
       * `to`.
       */
      readonly preserveQuery?: boolean;
    }
  | { readonly gone: true };

export type RedirectRule =
  | ({ readonly from: string | RegExp } & RedirectTarget & {
        readonly priority?: number;
      })
  | {
      readonly match: (url: URL) => RedirectTarget | null;
      readonly priority?: number;
    };

/** Status applied when a rule omits one — the SEO-conventional permanent move. */
const DEFAULT_REDIRECT_STATUS: RedirectStatus = 301;

interface CompiledRedirect {
  readonly test: (url: URL) => RedirectResolution | null;
  readonly priority: number;
}

export type CompiledRedirects = readonly CompiledRedirect[];

const byPriority = (a: CompiledRedirect, b: CompiledRedirect): number =>
  a.priority - b.priority;

function resolveTarget(
  target: RedirectTarget,
  url: URL,
  interpolate: (value: string) => string,
): RedirectResolution {
  if ("gone" in target) return { kind: "gone" };
  const location = interpolate(target.to);
  // Carry the request query onto a target that states neither its own query nor
  // a fragment (appending after a `#` would fold the query into the fragment),
  // unless the rule opts out.
  const withQuery =
    (target.preserveQuery ?? true) && url.search && !/[?#]/.test(location)
      ? location + url.search
      : location;
  return {
    kind: "redirect",
    location: withQuery,
    status: target.status ?? DEFAULT_REDIRECT_STATUS,
  };
}

// Substitute URLPattern named groups (`:slug`) captured from `from` into `to`.
function substituteNamed(
  to: string,
  groups: Record<string, string | undefined>,
): string {
  return to.replace(/:(\w+)/g, (whole, name: string) => groups[name] ?? whole);
}

function compileStringRule(
  from: string,
  target: RedirectTarget,
): (url: URL) => RedirectResolution | null {
  const pattern = new URLPattern({ pathname: from });
  return (url) => {
    const result = pattern.exec({ pathname: url.pathname });
    if (result === null) return null;
    const { groups } = result.pathname;
    return resolveTarget(target, url, (value) =>
      substituteNamed(value, groups),
    );
  };
}

// Substitute RegExp backreferences (`$1`, `$<name>`) captured from `from` into
// `to`; `$$` is a literal dollar. Mirrors Apache/nginx redirect syntax. One
// pass over `to` so an escaped `$$1` stays literal and captured text is never
// rescanned as a further backref.
function substituteBackrefs(to: string, match: RegExpExecArray): string {
  return to.replace(
    /\$\$|\$<(\w+)>|\$(\d+)/g,
    (whole, name: string | undefined, index: string | undefined) => {
      if (whole === "$$") return "$";
      if (name !== undefined) return match.groups?.[name] ?? "";
      return match[Number(index)] ?? "";
    },
  );
}

function compileRegExpRule(
  from: RegExp,
  target: RedirectTarget,
): (url: URL) => RedirectResolution | null {
  // Compile once. Strip `g`/`y` so a reused instance can't carry `lastIndex`
  // between requests; a non-global regex never advances it, so reuse is safe.
  const pattern =
    from.global || from.sticky
      ? new RegExp(from.source, from.flags.replace(/[gy]/g, ""))
      : from;
  return (url) => {
    const match = pattern.exec(url.pathname);
    if (match === null) return null;
    return resolveTarget(target, url, (value) =>
      substituteBackrefs(value, match),
    );
  };
}

export function compileRedirects(
  rules: readonly RedirectRule[],
  defaultPriority = 10,
): CompiledRedirects {
  // Stable sort (V8 guarantees it) so lower `priority` wins while equal-priority
  // rules keep their listed order — the first match at a given priority wins.
  return rules
    .map((rule) => ({
      priority: rule.priority ?? defaultPriority,
      test: compileRule(rule),
    }))
    .sort(byPriority);
}

function compileRule(
  rule: RedirectRule,
): (url: URL) => RedirectResolution | null {
  if ("match" in rule) {
    const { match } = rule;
    return (url) => {
      const target = match(url);
      return target === null
        ? null
        : resolveTarget(target, url, (value) => value);
    };
  }
  const { from } = rule;
  return typeof from === "string"
    ? compileStringRule(from, rule)
    : compileRegExpRule(from, rule);
}

/**
 * Default precedence per producer surface (lower wins). A rule's explicit
 * `priority` overrides its source default, so a theme can force a rule ahead of
 * the site's config when it deliberately owns that URL.
 */
export const REDIRECT_SOURCE_PRIORITY = {
  config: 10,
  plugin: 20,
  theme: 30,
} as const;

/**
 * Merge the three redirect producer surfaces into one precedence-ordered set:
 * the site's `config.redirects`, plugins' `registerRedirects`, and the theme's
 * declarative `redirects`. Each source seeds a default priority; explicit
 * per-rule priorities still win.
 */
export function assembleRedirects(sources: {
  readonly config?: readonly RedirectRule[];
  readonly plugin?: readonly RedirectRule[];
  readonly theme?: readonly RedirectRule[];
}): CompiledRedirects {
  return [
    ...compileRedirects(sources.config ?? [], REDIRECT_SOURCE_PRIORITY.config),
    ...compileRedirects(sources.plugin ?? [], REDIRECT_SOURCE_PRIORITY.plugin),
    ...compileRedirects(sources.theme ?? [], REDIRECT_SOURCE_PRIORITY.theme),
  ].sort(byPriority);
}

export function matchRedirect(
  url: URL,
  compiled: CompiledRedirects,
): RedirectResolution | null {
  for (const rule of compiled) {
    const outcome = rule.test(url);
    if (outcome !== null) return outcome;
  }
  return null;
}
