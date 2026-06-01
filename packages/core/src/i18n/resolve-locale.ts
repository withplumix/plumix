import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedI18n, ResolvedLocale } from "./locale-registry.js";
import { findEnabledLocale } from "./locale-registry.js";

interface ResolveLocaleArgs {
  readonly request: Request;
  readonly user: AuthenticatedUser | null;
  readonly i18n: ResolvedI18n;
}

// WP `determine_locale()` parity: operator override → user.meta.locale →
// site default. No cookie, no Accept-Language — those fragment public cache
// keys; layer them back via the override slot if needed.
export function resolveLocale({
  request,
  user,
  i18n,
}: ResolveLocaleArgs): ResolvedLocale {
  const override = i18n.resolveLocale?.(request, user);
  if (override) {
    const match = findEnabledLocale(i18n, override.code);
    if (match) return match;
  }
  if (typeof user?.meta.locale === "string") {
    const match = findEnabledLocale(i18n, user.meta.locale);
    if (match) return match;
  }
  return i18n.defaultLocale;
}
