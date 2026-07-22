import type { MessageDescriptor } from "@lingui/core";

import type { MutablePluginRegistry } from "./plugin/manifest.js";

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
  ogImage: {
    id: "core.settings.site.default_og_image",
    message: "Default social image URL",
  },
  publicSite: {
    id: "core.settings.site.public",
    message: "Allow search engines to index this site",
  },
  pageLabel: { id: "core.settings.general.label", message: "General" },
  pageDescription: {
    id: "core.settings.general.description",
    message: "Core site identity and metadata.",
  },
} as const satisfies Record<string, MessageDescriptor>;

const D = SITE_SETTINGS_DESCRIPTORS;

// Built-in site-identity settings. Seeded before plugin `setup()` (like
// the core template deps / lookup adapters) so every install has a
// canonical home for title / tagline / social links — themes read it via
// the `settings` template dep (`defineTemplate({ settings: ["site"] })`)
// and the future SEO plugin layers on top.
export function registerCoreSettings(registry: MutablePluginRegistry): void {
  registry.settingsGroups.set("site", {
    name: "site",
    registeredBy: null,
    label: D.groupLabel,
    description: D.groupDescription,
    fields: [
      {
        key: "title",
        type: "string",
        inputType: "text",
        label: D.title,
        maxLength: 200,
      },
      {
        key: "tagline",
        type: "string",
        inputType: "textarea",
        label: D.tagline,
        maxLength: 300,
      },
      // Social keys carry a `_url` suffix (unlike bare `title`/`tagline`)
      // so theme + SEO consumers reading `settings.site.twitter_url` see
      // the stored value's shape — a link, not a handle.
      {
        key: "twitter_url",
        type: "string",
        inputType: "url",
        label: D.twitter,
        maxLength: 300,
      },
      {
        key: "github_url",
        type: "string",
        inputType: "url",
        label: D.github,
        maxLength: 300,
      },
      {
        key: "mastodon_url",
        type: "string",
        inputType: "url",
        label: D.mastodon,
        maxLength: 300,
      },
      // Fallback Open Graph image for pages without their own; SEO defaults
      // read it for `og:image`.
      {
        key: "default_og_image",
        type: "string",
        inputType: "url",
        label: D.ogImage,
        maxLength: 500,
      },
      // Site-wide indexing gate. Default-true; when off, SEO emits
      // `noindex,nofollow` and `robots.txt` disallows all crawling.
      {
        key: "public",
        type: "boolean",
        inputType: "toggle",
        label: D.publicSite,
        default: true,
      },
    ],
  });

  registry.settingsPages.set("general", {
    name: "general",
    registeredBy: null,
    label: D.pageLabel,
    description: D.pageDescription,
    groups: ["site"],
    priority: 10,
  });
}
