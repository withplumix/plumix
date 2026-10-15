import type { PlumixConfig, PlumixConfigInput } from "../config.js";
import type { PlumixAuthConfig } from "../context/auth-config.js";
import { normalizeBasePath } from "../base-path.js";
import { ConfigError } from "../config.errors.js";
import { resolveLocales } from "../i18n/locale-registry.js";
import { resolveFrameworkRoutes } from "../route/contract/framework-routes.js";
import { welcomeTheme } from "../welcome-theme.js";

/**
 * Resolves the config shapes `config.ts` declares, keeping `auth`'s type for
 * `OAuthProvidersOf`. Here because the default theme is a surface, which no
 * contract may import.
 */
export function plumix<TAuth extends PlumixAuthConfig>(
  config: PlumixConfigInput & { readonly auth: TAuth },
): PlumixConfig & { readonly auth: TAuth } {
  // Fail at build time rather than crash on the first request. `plumix dev`
  // catches mail when no mailer is configured, so the pairing holds only
  // outside it.
  if (config.auth.magicLink && !config.mailer && !process.env.PLUMIX_DEV) {
    throw ConfigError.magicLinkRequiresMailer();
  }
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
