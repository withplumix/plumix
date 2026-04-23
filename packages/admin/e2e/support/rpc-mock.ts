import type { Page, Route } from "@playwright/test";

import type { AuthSessionOutput } from "@plumix/core";
import type { PlumixManifest } from "@plumix/core/manifest";
import type { Entry, Term, User } from "@plumix/core/schema";

// The e2e webServer is just Vite — no real backend — so every /_plumix/rpc
// call is intercepted here and answered with a deterministic fixture.
// Individual specs declare the shape they want per procedure so route
// `beforeLoad` + component queries resolve without hitting the network.

// One entry per procedure path we know how to mock. Typed against the
// real server shapes so a schema change on the core side fails this file's
// typecheck, forcing the spec author to update their fixture. Not exported
// — specs pass object literals that get structurally checked against this
// shape on the `mockRpc` call.
interface MockRpcHandlers {
  "/auth/session"?: AuthSessionOutput;
  "/entry/list"?: readonly Entry[];
  "/user/list"?: readonly User[];
  "/user/invite"?: { user: User; inviteToken: string };
  "/user/get"?: User;
  "/user/update"?: User;
  "/user/disable"?: User;
  "/user/enable"?: User;
  "/user/delete"?: User;
  "/term/list"?: readonly Term[];
  "/term/get"?: Term;
  "/term/create"?: Term;
  "/term/update"?: Term;
  "/term/delete"?: Term;
  "/settings/get"?: Record<string, unknown>;
  "/settings/upsert"?: Record<string, unknown>;
}

// oRPC's StandardRPCSerializer wire format — `meta` is always present,
// empty array for payloads with no BigInt/Date/etc. transforms.
function rpcOk(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ json: body, meta: [] }),
  });
}

export async function mockRpc(
  page: Page,
  handlers: MockRpcHandlers,
): Promise<void> {
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.endsWith(suffix)) {
        return rpcOk(route, body);
      }
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

export function mockSession(
  page: Page,
  body: AuthSessionOutput,
): Promise<void> {
  return mockRpc(page, { "/auth/session": body });
}

/**
 * Inject a manifest into the admin HTML before the module script loads.
 * Standalone `vite dev` ships an empty-manifest placeholder; specs that
 * need a registered post type (to hit `/entries/$slug`) install a
 * synthetic one via this helper. Uses `page.route` to mutate the HTML
 * response so `readManifest()` sees the populated tag on first parse.
 */
export async function mockManifest(
  page: Page,
  manifest: PlumixManifest,
): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    const payload = JSON.stringify(manifest).replaceAll("</", "<\\/");
    const next = html.replace(
      /<script id="plumix-manifest"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="plumix-manifest" type="application/json">${payload}</script>`,
    );
    await route.fulfill({
      response,
      body: next,
      headers: { ...response.headers(), "content-length": String(next.length) },
    });
  });
}

// Default post-type manifest fixture — one entry, slug `entries`, shared
// by specs that just need "something to list" without caring about the
// specifics.
export const MANIFEST_WITH_POST: PlumixManifest = {
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
  taxonomies: [],
  entryMetaBoxes: [],
  termMetaBoxes: [],
  settingsGroups: [],
  settingsPages: [],
};

// Manifest with two taxonomies — one hierarchical (category), one flat
// (tag) — shared by the taxonomy e2e specs so both code paths can be
// exercised from a single fixture.
export const MANIFEST_WITH_TAXONOMIES: PlumixManifest = {
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
  taxonomies: [
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
  entryMetaBoxes: [],
  termMetaBoxes: [],
  settingsGroups: [],
  settingsPages: [],
};

// Manifest with two meta boxes — one in the right rail (`side`), one in
// the main column (`normal`) — used by editor e2e to cover both slots.
export const MANIFEST_WITH_META_BOXES: PlumixManifest = {
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Entry", plural: "Posts" },
    },
  ],
  taxonomies: [],
  entryMetaBoxes: [
    {
      id: "seo",
      label: "SEO",
      context: "normal",
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
      context: "side",
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
  termMetaBoxes: [],
  settingsGroups: [],
  settingsPages: [],
};

// Manifest exercising the full settings hierarchy: one page (group),
// two groups composed on one page. Covers the plugin-author contract
// end-to-end — plugins register groups + a page that lists them, and
// the admin renders one shadcn `<Card>` per group with its own save
// button.
export const MANIFEST_WITH_SETTINGS: PlumixManifest = {
  entryTypes: [],
  taxonomies: [],
  entryMetaBoxes: [],
  termMetaBoxes: [],
  settingsGroups: [
    {
      name: "identity",
      label: "Site identity",
      description: "Public-facing site identity.",
      fields: [
        {
          name: "site_title",
          label: "Site title",
          type: "text",
          maxLength: 200,
        },
        {
          name: "site_description",
          label: "Tagline",
          type: "text",
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
          name: "admin_email",
          label: "Administration email",
          type: "text",
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

// Fixture: an authed admin session. Reused across every spec that needs a
// logged-in user — specs override individual fields via spread if they need
// something specific. Capabilities list covers the gates the admin UI
// checks (post sidebar, dashboard tiles, etc.); keep in sync with what
// `capabilitiesForRole("admin", ...)` returns for a bare install.
export const AUTHED_ADMIN: AuthSessionOutput = {
  user: {
    id: 1,
    email: "admin@example.test",
    name: "Admin",
    avatarUrl: null,
    role: "admin",
    capabilities: [
      "settings:manage",
      "plugin:manage",
      "post:create",
      "post:delete",
      "post:edit_any",
      "post:edit_own",
      "post:publish",
      "post:read",
      "taxonomy:manage",
      "user:create",
      "user:delete",
      "user:edit",
      "user:edit_own",
      "user:list",
      "user:promote",
      // Per-taxonomy caps matching MANIFEST_WITH_TAXONOMIES. The real
      // server derives these from `deriveTaxonomyCapabilities(name)` for
      // every registered taxonomy; mock-land hard-codes the union of
      // every taxonomy that any fixture uses.
      "category:read",
      "category:edit",
      "category:delete",
      "tag:read",
      "tag:edit",
      "tag:delete",
    ],
  },
  needsBootstrap: false,
};
