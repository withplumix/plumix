import { describe, expect, test } from "vitest";

import type { SiteRoles } from "../access/contract/roles.js";
import type { UserRole } from "../db/schema/users.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import { USER_ROLES } from "../db/schema/users.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/registry.js";
import { installPlugins } from "../runtime/install-plugins.js";
import {
  capabilitiesForRole,
  getCapabilityResolver,
  unknownRoleGrants,
} from "./rbac.js";

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
    "admin:access",
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
    "admin:access",
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

async function installSite(
  roles: SiteRoles,
  ...plugins: Parameters<typeof installPlugins>[0]["plugins"]
): Promise<PluginRegistry> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins,
    registry: createPluginRegistry(undefined, roles),
  });
  return registry;
}

const content = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("page", { label: "Pages" });
    ctx.registerEntryType("story", {
      label: "Stories",
      capabilityType: "post",
    });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
    ctx.registerCapability("comment:moderate", { grantTo: ["editor"] });
  },
});

describe("a role the site declares in config", () => {
  test("resolves exactly the capabilities its can grants", async () => {
    const registry = await installSite(
      {
        designer: {
          label: "Designer",
          can: {
            admin: ["access"],
            entry: { page: ["read", "edit_any"] },
            term: { category: ["assign"] },
            comment: ["moderate"],
          },
        },
      },
      content,
    );
    expect(capabilitiesForRole("designer", registry)).toEqual([
      "admin:access",
      "comment:moderate",
      "entry:page:edit_any",
      "entry:page:read",
      "term:category:assign",
    ]);
    expect(
      getCapabilityResolver(registry).hasCapability(
        "designer",
        "entry:page:edit_any",
      ),
    ).toBe(true);
  });

  test("one that extends another adds its parent's capabilities", async () => {
    const registry = await installSite(
      {
        designer: { extends: "author", can: { entry: { page: ["edit_any"] } } },
      },
      content,
    );
    const author = capabilitiesForRole("author", registry);
    expect(capabilitiesForRole("designer", registry)).toEqual(
      [...author, "entry:page:edit_any"].sort(),
    );
  });

  test("roles that extend each other all hold the same capabilities, whatever the key order", async () => {
    const forward = await installSite(
      {
        a: { extends: "b", can: { user: ["list"] } },
        b: { extends: "a", can: { admin: ["access"] } },
      },
      content,
    );
    const backward = await installSite(
      {
        b: { extends: "a", can: { admin: ["access"] } },
        a: { extends: "b", can: { user: ["list"] } },
      },
      content,
    );
    for (const registry of [forward, backward]) {
      expect(capabilitiesForRole("a", registry)).toEqual([
        "admin:access",
        "user:list",
      ]);
      expect(capabilitiesForRole("b", registry)).toEqual([
        "admin:access",
        "user:list",
      ]);
    }
  });

  test("a redefined default resolves only its new grants", async () => {
    const registry = await installSite(
      { editor: { can: { entry: { page: ["read"] }, user: ["list"] } } },
      content,
    );
    expect(capabilitiesForRole("editor", registry)).toEqual([
      "entry:page:read",
      "user:list",
    ]);
  });

  test("admin holds every capability, a plugin's included, whatever the config says", async () => {
    const audit = definePlugin("audit", {
      setup: (ctx) => {
        ctx.registerCapability("audit:read");
      },
    });
    const registry = await installSite(
      // @ts-expect-error admin can't be declared.
      { admin: { can: { user: ["list"] } } },
      content,
      audit,
    );
    const admin = getCapabilityResolver(registry);
    expect(admin.hasCapability("admin", "audit:read")).toBe(true);
    expect(admin.hasCapability("admin", "comment:moderate")).toBe(true);
    expect(admin.hasCapability("admin", "settings:manage")).toBe(true);
  });
});

/** Each kind of name nobody registered, beside one grant that resolves. */
const misspelled: SiteRoles = {
  designer: {
    extends: "ghost",
    can: {
      admin: ["access"],
      seo: ["manage"],
      entry: { pgae: ["read"] },
      term: { catgory: ["assign"] },
    },
  },
};

describe("a role naming something nobody registered", () => {
  test("the running resolver ignores the unknown names", async () => {
    const registry = await installSite(misspelled, content);
    expect(capabilitiesForRole("designer", registry)).toEqual(["admin:access"]);
  });

  test("the build check names each one", async () => {
    const registry = await installSite(misspelled, content);
    expect(unknownRoleGrants(registry)).toEqual([
      'Role "designer" extends "ghost", which is not a role.',
      'Role "designer" grants "seo:manage", which no plugin registers.',
      'Role "designer" grants entry type "pgae", which no plugin registers.',
      'Role "designer" grants taxonomy "catgory", which no plugin registers.',
    ]);
  });

  test("the build check passes a role whose every name is registered", async () => {
    const registry = await installSite(
      {
        designer: {
          extends: "author",
          can: {
            entry: { page: ["read"], story: ["edit_own"] },
            term: { category: ["assign"] },
            comment: ["moderate"],
          },
        },
        reviewer: { extends: "designer", can: {} },
      },
      content,
    );
    expect(unknownRoleGrants(registry)).toEqual([]);
  });
});
