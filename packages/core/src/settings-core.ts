import type { MutablePluginRegistry } from "./plugin/manifest.js";
import { SITE_SETTINGS_DESCRIPTORS } from "./i18n/site-settings-descriptors.js";

const D = SITE_SETTINGS_DESCRIPTORS;

// Built-in site-identity settings. Seeded before plugin `setup()` (like
// the core template deps / lookup adapters) so every install has a
// canonical home for title / tagline / social links — themes read it via
// the `settings` template dep (`defineTemplate({ settings: ["site"] })`)
// and `@plumix/plugin-seo` layers on top.
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
      // so a theme reading `settings.site.twitter_url` sees the stored
      // value's shape — a link, not a handle.
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
