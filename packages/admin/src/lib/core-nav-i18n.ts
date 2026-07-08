import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Mirror of `@plumix/core`'s `CORE_NAV_GROUPS` + `CORE_NAV_ITEMS`
// descriptor ids so the admin's `lingui extract` picks them up into
// `locales/en.po` (and the per-locale translation catalogs). Actual
// rendering reads the descriptor from the manifest at runtime — this
// module isn't imported elsewhere. Keep ids in lockstep with
// `packages/core/src/plugin/manifest.ts:CORE_NAV_GROUPS` and
// `:CORE_NAV_ITEMS`.

export const CORE_NAV_DESCRIPTORS = {
  groupOverview: defineMessage({
    id: "core.adminNav.overview",
    message: "Overview",
  }),
  groupContent: defineMessage({
    id: "core.adminNav.content",
    message: "Entries",
  }),
  groupTermTaxonomies: defineMessage({
    id: "core.adminNav.termTaxonomies",
    message: "Taxonomies",
  }),
  groupManagement: defineMessage({
    id: "core.adminNav.management",
    message: "Management",
  }),
  itemDashboard: defineMessage({
    id: "core.adminNav.item.dashboard",
    message: "Dashboard",
  }),
  itemUsers: defineMessage({
    id: "core.adminNav.item.users",
    message: "Users",
  }),
  itemAllowedDomains: defineMessage({
    id: "core.adminNav.item.allowedDomains",
    message: "Allowed domains",
  }),
  itemMailer: defineMessage({
    id: "core.adminNav.item.mailer",
    message: "Mailer",
  }),
  itemSettings: defineMessage({
    id: "core.adminNav.item.settings",
    message: "Settings",
  }),

  // Command-palette search aliases. Keyed by word so a synonym shared across
  // items (e.g. `email` for both Allowed domains and Mailer) resolves to one
  // translatable entry. Keep in lockstep with the `keywords` arrays in
  // `packages/core/src/plugin/manifest.ts:CORE_NAV_ITEMS`.
  keywordHome: defineMessage({
    id: "core.adminNav.keyword.home",
    message: "home",
  }),
  keywordOverview: defineMessage({
    id: "core.adminNav.keyword.overview",
    message: "overview",
  }),
  keywordAccounts: defineMessage({
    id: "core.adminNav.keyword.accounts",
    message: "accounts",
  }),
  keywordTeam: defineMessage({
    id: "core.adminNav.keyword.team",
    message: "team",
  }),
  keywordPeople: defineMessage({
    id: "core.adminNav.keyword.people",
    message: "people",
  }),
  keywordDomains: defineMessage({
    id: "core.adminNav.keyword.domains",
    message: "domains",
  }),
  keywordEmail: defineMessage({
    id: "core.adminNav.keyword.email",
    message: "email",
  }),
  keywordSignups: defineMessage({
    id: "core.adminNav.keyword.signups",
    message: "signups",
  }),
  keywordSmtp: defineMessage({
    id: "core.adminNav.keyword.smtp",
    message: "smtp",
  }),
  keywordConfiguration: defineMessage({
    id: "core.adminNav.keyword.configuration",
    message: "configuration",
  }),
  keywordPreferences: defineMessage({
    id: "core.adminNav.keyword.preferences",
    message: "preferences",
  }),
  keywordOptions: defineMessage({
    id: "core.adminNav.keyword.options",
    message: "options",
  }),
} satisfies Record<string, MessageDescriptor>;
