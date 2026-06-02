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
} satisfies Record<string, MessageDescriptor>;
