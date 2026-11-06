import { describe, expect, test } from "vitest";

import { toRegisteredEntryType } from "../../plugin/registry.js";
import {
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
} from "./rbac.js";

/** The default roles each shipped action set grants, `admin` included. */
const RECEIVERS = {
  members: ["subscriber", "contributor", "author", "editor", "admin"],
  writers: ["contributor", "author", "editor", "admin"],
  publishers: ["author", "editor", "admin"],
  editors: ["editor", "admin"],
  admin: ["admin"],
} as const;

describe("deriveEntryTypeCapabilities", () => {
  test("defaults match POST_TYPE_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType("post", { label: "Posts" }, null),
    );
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.grantTo]));
    expect(byName["entry:post:read"]).toEqual(RECEIVERS.members);
    expect(byName["entry:post:edit_own"]).toEqual(RECEIVERS.writers);
    expect(byName["entry:post:publish"]).toEqual(RECEIVERS.publishers);
    expect(byName["entry:post:edit_any"]).toEqual(RECEIVERS.editors);
    expect(byName["entry:post:delete"]).toEqual(RECEIVERS.editors);
    expect(byName["entry:post:create"]).toEqual(RECEIVERS.writers);
  });

  test("`capabilities` override replaces the receiving roles on specified actions only", () => {
    // Menu-item-shape: every action requires admin — editors lose access.
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "nav_menu_item",
        {
          label: "Menu items",
          capabilities: {
            read: ["admin"],
            create: ["admin"],
            edit_own: ["admin"],
            publish: ["admin"],
            edit_any: ["admin"],
            delete: ["admin"],
            read_revisions: ["admin"],
            restore_revision: ["admin"],
            edit_layout: ["admin"],
          },
        },
        null,
      ),
    );
    for (const cap of caps) {
      expect(cap.grantTo).toEqual(["admin"]);
    }
  });

  test("partial override leaves non-overridden actions at their default roles", () => {
    // Media-shape: only `create` is remapped (authors and editors upload).
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "attachment",
        {
          label: "Attachments",
          capabilities: { create: ["author", "editor"] },
        },
        null,
      ),
    );
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.grantTo]));
    expect(byName["entry:attachment:create"]).toEqual(RECEIVERS.publishers);
    // Other actions remain at defaults.
    expect(byName["entry:attachment:read"]).toEqual(RECEIVERS.members);
    expect(byName["entry:attachment:edit_own"]).toEqual(RECEIVERS.writers);
    expect(byName["entry:attachment:publish"]).toEqual(RECEIVERS.publishers);
  });

  test("overrides compose with capabilityType pooling", () => {
    // capabilityType pools derived cap names; override still applies to
    // the pooled name.
    const caps = deriveEntryTypeCapabilities(
      toRegisteredEntryType(
        "story",
        {
          label: "Stories",
          capabilityType: "post",
          capabilities: { delete: ["admin"] },
        },
        null,
      ),
    );
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.grantTo]));
    expect(byName["entry:post:delete"]).toEqual(RECEIVERS.admin);
    expect(byName["entry:post:publish"]).toEqual(RECEIVERS.publishers);
  });
});

describe("deriveTermTaxonomyCapabilities", () => {
  test("defaults match TAXONOMY_CAPABILITY_ACTIONS when no override is set", () => {
    const caps = deriveTermTaxonomyCapabilities("category", {});
    const byName = Object.fromEntries(caps.map((c) => [c.name, c.grantTo]));
    expect(byName["term:category:assign"]).toEqual(RECEIVERS.writers);
    expect(byName["term:category:manage"]).toEqual(RECEIVERS.editors);
    expect(byName["term:category:edit"]).toEqual(RECEIVERS.editors);
    expect(byName["term:category:delete"]).toEqual(RECEIVERS.editors);
  });

  test("nav_menu-shape override raises every action to admin", () => {
    const caps = deriveTermTaxonomyCapabilities("nav_menu", {
      capabilities: {
        read: ["admin"],
        assign: ["admin"],
        edit: ["admin"],
        delete: ["admin"],
        manage: ["admin"],
      },
    });
    for (const cap of caps) {
      expect(cap.grantTo).toEqual(["admin"]);
    }
  });
});
