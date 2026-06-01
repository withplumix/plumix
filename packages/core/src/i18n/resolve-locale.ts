import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedI18n, ResolvedLocale } from "./locale-registry.js";
import { readSessionCookie } from "../auth/cookies.js";

const LOCALE_COOKIE = "plumix-locale";

interface ResolveLocaleArgs {
  readonly request: Request;
  readonly user: AuthenticatedUser | null;
  readonly i18n: ResolvedI18n;
}

// WP `determine_locale()` parity: signed-in user beats anonymous-visitor
// signals. Order: operator override → user.meta.locale → cookie → header → default.
export function resolveLocale(args: ResolveLocaleArgs): ResolvedLocale {
  const fromOverride = matchOverride(args);
  if (fromOverride) return fromOverride;
  const fromUser = matchUserMeta(args.user, args.i18n);
  if (fromUser) return fromUser;
  const fromCookie = matchCookie(args.request, args.i18n);
  if (fromCookie) return fromCookie;
  const fromHeader = matchAcceptLanguage(args.request, args.i18n);
  if (fromHeader) return fromHeader;
  return args.i18n.defaultLocale;
}

function matchOverride(args: ResolveLocaleArgs): ResolvedLocale | null {
  const returned = args.i18n.resolveLocale?.(args.request, args.user);
  if (!returned) return null;
  // Trust boundary: the override may have hand-built a locale; require it
  // to be the same enabled entry the rest of the chain would return.
  return (
    args.i18n.locales.find((l) => l.code === returned.code && l.enabled) ?? null
  );
}

function matchUserMeta(
  user: AuthenticatedUser | null,
  i18n: ResolvedI18n,
): ResolvedLocale | null {
  const code = user?.meta.locale;
  if (typeof code !== "string") return null;
  return i18n.locales.find((l) => l.code === code && l.enabled) ?? null;
}

function matchCookie(
  request: Request,
  i18n: ResolvedI18n,
): ResolvedLocale | null {
  const code = readSessionCookie(request, LOCALE_COOKIE);
  if (!code) return null;
  return i18n.locales.find((l) => l.code === code && l.enabled) ?? null;
}

// Region-tag fallbacks: browsers send `zh-Hant`/`zh-Hans`/`pt-PT`, operators
// configure `zh-TW`/`zh-CN`/`pt-BR`. Without these, a `pt-PT` visitor on a
// `pt-BR` site falls all the way through to English.
const SCRIPT_LANGUAGE_MAP: Record<string, string> = {
  "zh-Hant": "zh-TW",
  "zh-Hans": "zh-CN",
};

const BASE_LANGUAGE_MAP: Record<string, string> = {
  "pt-PT": "pt-BR",
};

function matchAcceptLanguage(
  request: Request,
  i18n: ResolvedI18n,
): ResolvedLocale | null {
  const header = request.headers.get("accept-language");
  if (!header) return null;
  for (const tag of parseAcceptLanguage(header)) {
    const hit = matchTag(tag, i18n);
    if (hit) return hit;
  }
  return null;
}

function matchTag(tag: string, i18n: ResolvedI18n): ResolvedLocale | null {
  const enabled = i18n.locales.filter((l) => l.enabled);
  return (
    enabled.find((l) => l.code === tag) ??
    enabled.find((l) => l.code === SCRIPT_LANGUAGE_MAP[tag]) ??
    enabled.find((l) => l.code === BASE_LANGUAGE_MAP[tag]) ??
    null
  );
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((entry) => {
      const [tagPart, ...params] = entry.split(";");
      const tag = canonicalTag(tagPart?.trim() ?? "");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter(({ tag, q }) => tag && q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ tag }) => tag);
}

function canonicalTag(raw: string): string {
  // RFC 4647 says tags are case-insensitive; browsers usually emit canonical
  // form but spec-conformant clients sometimes don't. Fall back to the raw
  // string on `*`, `und`, or any input Intl.Locale rejects.
  try {
    return new Intl.Locale(raw).toString();
  } catch {
    return raw;
  }
}
