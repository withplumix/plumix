import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Extraction mirror for core's built-in site-settings labels (see
// `core-nav-i18n.ts` / `core-type-labels-i18n.ts` for the pattern).
// Rendering reads the descriptor off the manifest via `i18n._`; these
// `defineMessage` calls only exist so admin's `lingui extract` pulls the
// ids into `locales/*.po`. Lockstep with
// `@plumix/core`'s `SITE_SETTINGS_DESCRIPTORS` is test-guarded.
export const CORE_SETTINGS_DESCRIPTORS = {
  groupLabel: defineMessage({
    id: "core.settings.site.label",
    message: "Site identity",
  }),
  groupDescription: defineMessage({
    id: "core.settings.site.description",
    message: "Public-facing name, tagline, and social links.",
  }),
  title: defineMessage({
    id: "core.settings.site.title",
    message: "Site title",
  }),
  tagline: defineMessage({
    id: "core.settings.site.tagline",
    message: "Tagline",
  }),
  twitter: defineMessage({
    id: "core.settings.site.twitter",
    message: "X (Twitter) URL",
  }),
  github: defineMessage({
    id: "core.settings.site.github",
    message: "GitHub URL",
  }),
  mastodon: defineMessage({
    id: "core.settings.site.mastodon",
    message: "Mastodon URL",
  }),
  ogImage: defineMessage({
    id: "core.settings.site.default_og_image",
    message: "Default social image URL",
  }),
  pageLabel: defineMessage({
    id: "core.settings.general.label",
    message: "General",
  }),
  pageDescription: defineMessage({
    id: "core.settings.general.description",
    message: "Core site identity and metadata.",
  }),
} satisfies Record<string, MessageDescriptor>;
