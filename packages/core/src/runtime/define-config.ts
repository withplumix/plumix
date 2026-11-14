import type { RoleName, SiteRoles } from "../access/contract/roles.js";
import type { PlumixConfig, PlumixConfigInput } from "../config.js";
import type { PlumixAuthConfig } from "../context/auth-config.js";
import { normalizeBasePath } from "../base-path.js";
import { resolveLocales } from "../i18n/locale-registry.js";
import { resolveFrameworkRoutes } from "../route/contract/framework-routes.js";
import { welcomeTheme } from "../welcome-theme.js";

/**
 * Resolves the config shapes `config.ts` declares, keeping `auth`'s type for
 * `OAuthProvidersOf`. Here because the default theme is a surface, which no
 * contract may import.
 */
export function plumix<
  const TRoles extends SiteRoles<Extract<keyof TRoles, string>> = Record<
    never,
    never
  >,
  TAuth extends PlumixAuthConfig<RoleName<TRoles>> = PlumixAuthConfig<
    RoleName<TRoles>
  >,
>(
  config: PlumixConfigInput & {
    readonly auth: TAuth;
    readonly roles?: TRoles;
  },
): Omit<PlumixConfig, "auth" | "roles"> & {
  readonly auth: TAuth;
  readonly roles?: TRoles;
} {
  return {
    ...config,
    theme: config.theme ?? welcomeTheme,
    plugins: config.plugins ?? [],
    redirects: config.redirects ?? [],
    routes: resolveFrameworkRoutes(config.routes),
    i18n: resolveLocales(
      config.i18n ?? { defaultLocale: "en", locales: ["en"] },
    ),
    basePath: normalizeBasePath(config.basePath),
  };
}

export { plumix as defineConfig };
