// Admin's e2e support layer. The generic playwright helpers
// (`mockRpc`, `mockSession`, `mockManifest`, `rpcOkBody`, etc.) live
// in `@plumix/core/test/playwright` so the same surface is what
// external plugin authors use — admin re-exports them and adds the
// admin-specific manifest + session fixtures the suite shares.

import type { PlumixManifest } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";
import {
  AUTHED_ADMIN as BASE_AUTHED_ADMIN,
  withCapabilities,
} from "@plumix/core/test/playwright";

export {
  anonymousSession,
  mockManifest,
  mockRpc,
  mockSession,
  rpcErrorBody,
  rpcOkBody,
  withCapabilities,
} from "@plumix/core/test/playwright";

// Default post-type manifest fixture — one entry, slug `entries`, shared
// by specs that just need "something to list" without caring about the
// specifics.
export const MANIFEST_WITH_POST: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
};

// Manifest with two termTaxonomies — one hierarchical (category), one flat
// (tag) — shared by the taxonomy e2e specs so both code paths can be
// exercised from a single fixture.
export const MANIFEST_WITH_TAXONOMIES: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
  termTaxonomies: [
    {
      name: "category",
      label: "Categories",
      labels: { singular: "Category" },
      isHierarchical: true,
    },
    {
      name: "tag",
      label: "Tags",
      labels: { singular: "Tag" },
    },
  ],
};

// Manifest with two meta boxes — one in the right rail (`side`), one in
// the main column (`normal`) — used by editor e2e to cover both slots.
export const MANIFEST_WITH_META_BOXES: PlumixManifest = {
  ...emptyManifest(),
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
  entryMetaBoxes: [
    {
      id: "seo",
      label: "SEO",
      location: "bottom",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
          maxLength: 60,
        },
      ],
    },
    {
      id: "featured",
      label: "Featured",
      location: "sidebar",
      entryTypes: ["post"],
      fields: [
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
    },
  ],
};

// Manifest exercising the full settings hierarchy: one page (group),
// two groups composed on one page. Covers the plugin-author contract
// end-to-end — plugins register groups + a page that lists them, and
// the admin renders one shadcn `<Card>` per group with its own save
// button.
export const MANIFEST_WITH_SETTINGS: PlumixManifest = {
  ...emptyManifest(),
  settingsGroups: [
    {
      name: "identity",
      label: "Site identity",
      description: "Public-facing site identity.",
      fields: [
        {
          key: "site_title",
          label: "Site title",
          type: "string",
          inputType: "text",
          maxLength: 200,
        },
        {
          key: "site_description",
          label: "Tagline",
          type: "string",
          inputType: "textarea",
          maxLength: 300,
        },
      ],
    },
    {
      name: "contact",
      label: "Contact",
      description: "Admin notifications route to this address.",
      fields: [
        {
          key: "admin_email",
          label: "Administration email",
          type: "string",
          inputType: "email",
          maxLength: 254,
        },
      ],
    },
  ],
  settingsPages: [
    {
      name: "general",
      label: "General",
      description: "Basic site identity and contact details.",
      groups: ["identity", "contact"],
    },
  ],
};

// Admin's e2e suite needs a bigger capability set than `core`'s baseline
// `AUTHED_ADMIN` because the taxonomy fixtures depend on per-taxonomy
// caps the real server would derive at registration time. Layer them
// on once and let specs use this fixture by default.
export const AUTHED_ADMIN = withCapabilities(
  BASE_AUTHED_ADMIN,
  "term:category:read",
  "term:category:edit",
  "term:category:delete",
  "term:tag:read",
  "term:tag:edit",
  "term:tag:delete",
);
