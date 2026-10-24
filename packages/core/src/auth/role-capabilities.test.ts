import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { USER_ROLES } from "../db/schema/users.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { capabilitiesForRole, getCapabilityResolver } from "./rbac.js";

/**
 * Every rung, every kind of capability: core, derived entry and term (with
 * and without an override, and pooled into core's `post`), and plugin
 * capabilities by `minRole` and `defaultGrants`.
 */
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

/**
 * What the ladder granted each rung before roles became capability sets: the
 * "rights unchanged" guard for #3359. Change it only with a ticket that
 * changes someone's rights.
 */
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
    "entry:page:create",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:post:create",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:product:create",
    "entry:product:edit_own",
    "entry:product:read",
    "term:category:assign",
    "term:category:read",
    "term:region:assign",
    "term:region:read",
    "user:edit_own",
  ],
  editor: [
    "entry:page:create",
    "entry:page:delete",
    "entry:page:edit_any",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:page:read_revisions",
    "entry:page:restore_revision",
    "entry:post:create",
    "entry:post:edit_any",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:post:read_revisions",
    "entry:post:restore_revision",
    "entry:product:create",
    "entry:product:edit_any",
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
    "entry:page:create",
    "entry:page:delete",
    "entry:page:edit_any",
    "entry:page:edit_own",
    "entry:page:publish",
    "entry:page:read",
    "entry:page:read_revisions",
    "entry:page:restore_revision",
    "entry:post:create",
    "entry:post:delete",
    "entry:post:edit_any",
    "entry:post:edit_own",
    "entry:post:publish",
    "entry:post:read",
    "entry:post:read_revisions",
    "entry:post:restore_revision",
    "entry:product:create",
    "entry:product:delete",
    "entry:product:edit_any",
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
  test("the session's capability list and hasCapability agree for every role", async () => {
    const registry = await installLadderSite();
    const resolver = getCapabilityResolver(registry);
    const names = [
      ...allCapabilityNames(registry),
      ...registry.capabilities.keys(),
    ];
    for (const role of USER_ROLES) {
      const listed = new Set(capabilitiesForRole(role, registry));
      for (const name of names) {
        expect(
          { role, name, granted: resolver.hasCapability(role, name) },
          `${role} / ${name}`,
        ).toEqual({ role, name, granted: listed.has(name) });
      }
    }
  });

  test.each(USER_ROLES)(
    "%s holds exactly what the ladder granted it",
    async (role) => {
      const registry = await installLadderSite();
      const resolver = getCapabilityResolver(registry);
      expect(capabilitiesForRole(role, registry)).toEqual(LADDER_GRANTS[role]);
      for (const name of LADDER_GRANTS[role]) {
        expect(resolver.hasCapability(role, name), name).toBe(true);
      }
    },
  );
});

async function rolesHolding(
  capability: string,
  ...plugins: Parameters<typeof installPlugins>[0]["plugins"]
): Promise<readonly UserRole[]> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins,
  });
  const resolver = getCapabilityResolver(registry);
  return USER_ROLES.filter((role) => resolver.hasCapability(role, capability));
}

describe("a plugin naming the default roles that receive its capability", () => {
  test("grantTo gives the capability to exactly those roles plus admin", async () => {
    const plugin = definePlugin("badges", {
      setup: (ctx) => {
        ctx.registerCapability("badge:award", {
          grantTo: ["contributor", "editor"],
        });
      },
    });
    expect(await rolesHolding("badge:award", plugin)).toEqual([
      "contributor",
      "editor",
      "admin",
    ]);
  });

  test("a capability registered without grantTo goes to admin only", async () => {
    const plugin = definePlugin("audit", {
      setup: (ctx) => {
        ctx.registerCapability("audit:read");
      },
    });
    expect(await rolesHolding("audit:read", plugin)).toEqual(["admin"]);
  });

  test("an entry type's override names the default roles that receive an action", async () => {
    const plugin = definePlugin("library", {
      setup: (ctx) => {
        ctx.registerEntryType("asset", {
          label: "Assets",
          capabilities: { delete: ["author", "editor"] },
        });
      },
    });
    expect(await rolesHolding("entry:asset:delete", plugin)).toEqual([
      "author",
      "editor",
      "admin",
    ]);
  });

  test("a taxonomy's override names the default roles that receive an action", async () => {
    const plugin = definePlugin("geo", {
      setup: (ctx) => {
        ctx.registerTermTaxonomy("region", {
          label: "Regions",
          capabilities: { manage: ["author"] },
        });
      },
    });
    expect(await rolesHolding("term:region:manage", plugin)).toEqual([
      "author",
      "admin",
    ]);
  });

  test("two plugins pooling one capabilityType receive the union of their grants", async () => {
    const docs = definePlugin("docs", {
      setup: (ctx) => {
        ctx.registerEntryType("doc", {
          label: "Docs",
          capabilityType: "knowledge",
          capabilities: { delete: ["author"] },
        });
      },
    });
    const guides = definePlugin("guides", {
      setup: (ctx) => {
        ctx.registerEntryType("guide", {
          label: "Guides",
          capabilityType: "knowledge",
          capabilities: { delete: ["contributor"] },
        });
      },
    });
    expect(await rolesHolding("entry:knowledge:delete", docs, guides)).toEqual([
      "contributor",
      "author",
      "admin",
    ]);
  });
});
