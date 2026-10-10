import { base } from "../../base.js";

// Public, for the login screen. `${pluginId}:${key}` is globally unique, so
// it serves as a stable React key.
export const loginLinks = base.handler(({ context }) =>
  context.plugins.loginLinks.map((link) => ({
    id: `${link.registeredBy}:${link.key}`,
    label: link.label,
    href: link.href,
  })),
);
