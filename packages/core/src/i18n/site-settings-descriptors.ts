import type { MessageDescriptor } from "@lingui/core";

// Descriptors core renders for the built-in site settings. They resolve
// inside the admin SPA via the manifest cascade (`i18n._`), so admin's
// catalogs own the translations — `core-settings-i18n.ts` mirrors these
// ids for extraction, lockstep-guarded. Exported to back that test.
export const SITE_SETTINGS_DESCRIPTORS = {
  groupLabel: {
    id: "core.settings.site.label",
    message: "Site identity",
  },
  groupDescription: {
    id: "core.settings.site.description",
    message: "Public-facing name, tagline, and social links.",
  },
  title: { id: "core.settings.site.title", message: "Site title" },
  tagline: { id: "core.settings.site.tagline", message: "Tagline" },
  twitter: { id: "core.settings.site.twitter", message: "X (Twitter) URL" },
  github: { id: "core.settings.site.github", message: "GitHub URL" },
  mastodon: { id: "core.settings.site.mastodon", message: "Mastodon URL" },
  pageLabel: { id: "core.settings.general.label", message: "General" },
  pageDescription: {
    id: "core.settings.general.description",
    message: "Core site identity and metadata.",
  },
} as const satisfies Record<string, MessageDescriptor>;
