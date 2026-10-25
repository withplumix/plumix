import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { USER_ROLES } from "../db/schema/users.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { capabilitiesForRole, getCapabilityResolver } from "./rbac.js";

const ladderSite = definePlugin("ladder", {
  setup: (ctx) => {
    ctx.registerEntryType("page", { label: "Pages" });
    ctx.registerEntryType("product", {
      label: "Products",
      capabilities: { delete: "admin", publish: "editor" },
    });
    ctx.registerEntryType("story", {
      label: "Stories",
      capabilityType: "post",
      capabilities: { delete: "admin" },
    });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      capabilities: { assign: "author" },
    });
    ctx.registerCapability("seo:manage", "editor");
    ctx.registerCapability("menu:manage", {
      minRole: "admin",
      defaultGrants: ["contributor"],
    });
  },
});

/** Change this only in a change that changes someone's rights. */
const LADDER_GRANTS: Readonly<Record<UserRole, readonly string[]>> = {
  subscriber: [
    "entry:page:read",
    "entry:post:read",
    "entry:product:read",
    "term:category:read",
    "term:region:read",
    "user:edit_own",
  ],
  contributor: [
    "admin:access",
    "entry:page:create",
    "entry:page:edit_own",
    "entry:page:read",
    "entry:post:create",
    "entry:post:edit_own",
    "entry:post:read",
    "entry:product:create",
    "entry:product:edit_own",
    "entry:product:read",
    "menu:manage",
    "term:category:assign",
    "term:category:read",
    "term:region:read",
    "user:edit_own",
  ],
  author: [
    "admin:access",
    "entry:page:create",
    "entry:page:edit_layout",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:post:create",
    "entry:post:edit_layout",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:product:create",
    "entry:product:edit_layout",
    "entry:product:edit_own",
    "entry:product:read",
    "term:category:assign",
    "term:category:read",
    "term:region:assign",
    "term:region:read",
    "user:edit_own",
  ],
  editor: [
    "admin:access",
    "entry:page:create",
    "entry:page:delete",
    "entry:page:edit_any",
    "entry:page:edit_layout",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:page:read_revisions",
    "entry:page:restore_revision",
    "entry:post:create",
    "entry:post:edit_any",
    "entry:post:edit_layout",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:post:read_revisions",
    "entry:post:restore_revision",
    "entry:product:create",
    "entry:product:edit_any",
    "entry:product:edit_layout",
    "entry:product:edit_own",
    "entry:product:publish",
    "entry:product:read",
    "entry:product:read_revisions",
    "entry:product:restore_revision",
    "seo:manage",
    "term:category:assign",
    "term:category:delete",
    "term:category:edit",
    "term:category:manage",
    "term:category:read",
    "term:region:assign",
    "term:region:delete",
    "term:region:edit",
    "term:region:manage",
    "term:region:read",
    "user:edit_own",
    "user:list",
  ],
  admin: [
    "admin:access",
    "entry:page:create",
    "entry:page:delete",
    "entry:page:edit_any",
    "entry:page:edit_layout",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:page:read_revisions",
    "entry:page:restore_revision",
    "entry:post:create",
    "entry:post:delete",
    "entry:post:edit_any",
    "entry:post:edit_layout",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:post:read_revisions",
    "entry:post:restore_revision",
    "entry:product:create",
    "entry:product:delete",
    "entry:product:edit_any",
    "entry:product:edit_layout",
    "entry:product:edit_own",
    "entry:product:publish",
    "entry:product:read",
    "entry:product:read_revisions",
    "entry:product:restore_revision",
    "menu:manage",
    "plugin:manage",
    "seo:manage",
    "settings:manage",
    "term:category:assign",
    "term:category:delete",
    "term:category:edit",
    "term:category:manage",
    "term:category:read",
    "term:region:assign",
    "term:region:delete",
    "term:region:edit",
    "term:region:manage",
    "term:region:read",
    "user:create",
    "user:delete",
    "user:edit",
    "user:edit_own",
    "user:list",
    "user:manage_tokens",
    "user:promote",
  ],
};

async function installLadderSite(): Promise<PluginRegistry> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [ladderSite],
  });
  return registry;
}

function allCapabilityNames(registry: PluginRegistry): readonly string[] {
  return [
    ...new Set(
      USER_ROLES.flatMap((role) => capabilitiesForRole(role, registry)),
    ),
  ].sort();
}

describe("the resolved role table", () => {
  test.each(USER_ROLES)(
    "the session's capability list and hasCapability agree for %s",
    async (role) => {
      const registry = await installLadderSite();
      const resolver = getCapabilityResolver(registry);
      const names = allCapabilityNames(registry);

      expect(
        names.filter((name) => resolver.hasCapability(role, name)),
      ).toEqual(capabilitiesForRole(role, registry));
    },
  );

  test.each(USER_ROLES)(
    "keeps the capabilities the ladder granted %s",
    async (role) => {
      const registry = await installLadderSite();

      expect(capabilitiesForRole(role, registry)).toEqual(LADDER_GRANTS[role]);
    },
  );
});
