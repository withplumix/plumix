import type { MessageDescriptor } from "@lingui/core";

/**
 * Exported for the lockstep test with admin's extraction mirror, since admin's
 * catalogs own the translations.
 */
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
