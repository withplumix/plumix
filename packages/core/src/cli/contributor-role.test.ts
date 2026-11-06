import { describe, expect, test } from "vitest";

import type { SiteRoles } from "../access/contract/roles.js";
import { capabilitiesForRole, unknownRoleGrants } from "../auth/rbac.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/registry.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { contributorRoleSnippet } from "./contributor-role.js";

/**
 * Entry types and taxonomies with and without overrides, one pooled into
 * core's `post`, and one plugin capability.
 */
const site = definePlugin("site", {
  setup: (ctx) => {
    ctx.registerEntryType("page", { label: "Pages" });
    ctx.registerEntryType("product", {
      label: "Products",
      capabilities: { delete: ["admin"], publish: ["editor"] },
    });
    ctx.registerEntryType("story", {
      label: "Stories",
      capabilityType: "post",
      capabilities: { delete: ["admin"] },
    });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
    ctx.registerTermTaxonomy("region", {
      label: "Regions",
      capabilities: { assign: ["author", "editor"] },
    });
    ctx.registerCapability("seo:manage", { grantTo: ["editor"] });
  },
});

/** What core grants a `contributor` on this site, pinned from the old ladder. */
const CONTRIBUTOR_CORE_GRANTS = [
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
  "term:category:assign",
  "term:category:read",
  "term:region:read",
  "user:edit_own",
];

async function install(roles?: SiteRoles) {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [site],
    registry: createPluginRegistry(undefined, roles),
  });
  return registry;
}

/** The snippet as a site pastes it into `roles`. */
function pasted(snippet: string): SiteRoles {
  const [name, ...body] = snippet.split(": ");
  return { [String(name)]: JSON.parse(body.join(": ")) as never };
}

describe("the contributor role plumix migrate prints", () => {
  test("pasted into roles, resolves exactly the core rights contributors had", async () => {
    const snippet = contributorRoleSnippet(await install());

    const registry = await install(pasted(snippet));

    expect(capabilitiesForRole("contributor", registry)).toEqual(
      CONTRIBUTOR_CORE_GRANTS,
    );
    expect(unknownRoleGrants(registry)).toEqual([]);
  });

  test("grants core's posts when no entry type pools into them", async () => {
    const { registry: bare } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [],
    });
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [],
      registry: createPluginRegistry(
        undefined,
        pasted(contributorRoleSnippet(bare)),
      ),
    });

    expect(capabilitiesForRole("contributor", registry)).toEqual([
      "admin:access",
      "entry:post:create",
      "entry:post:edit_own",
      "entry:post:read",
      "user:edit_own",
    ]);
    expect(unknownRoleGrants(registry)).toEqual([]);
  });
});
