import { base } from "../../base.js";

// Public — used by the login screen to render plugin-shipped sign-in
// buttons (SAML, Microsoft, custom SSO). Driven purely by the plugin
// registry, resolved at app build time; no DB call. Pairs with
// `oauthProviders` (which surfaces config-driven OAuth entries) — the
// admin renders both lists. The `id` is `${pluginId}:${key}` — a
// globally-unique stable React key derived from the plugin attribution
// the registrar already records.
export const loginLinks = base.handler(({ context }) =>
  context.plugins.loginLinks.map((link) => ({
    id: `${link.registeredBy}:${link.key}`,
    label: link.label,
    href: link.href,
  })),
);
