import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

/** Exists only so `lingui extract` sees core's site-settings ids. */
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
  pageLabel: defineMessage({
    id: "core.settings.general.label",
    message: "General",
  }),
  pageDescription: defineMessage({
    id: "core.settings.general.description",
    message: "Core site identity and metadata.",
  }),
} satisfies Record<string, MessageDescriptor>;
