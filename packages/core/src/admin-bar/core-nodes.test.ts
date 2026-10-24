import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { BarRenderContext } from "./types.js";
import { deriveEntryTypeCapabilities } from "../access/contract/rbac.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import { silentLogger } from "../test/context.js";
import { collectAdminBarNodes } from "./collect.js";
import {
  registerCoreAdminBarNodes,
  registerNewEntryAdminBarNodes,
} from "./core-nodes.js";

const allow = (): boolean => true;

function ctx(overrides: Partial<BarRenderContext> = {}): BarRenderContext {
  return {
    user: {
      id: 1,
      email: "editor@cms.example",
      role: "editor",
      meta: {},
    },
    queriedEntry: null,
    request: new Request("https://cms.example/"),
    siteName: "My Site",
    auth: { can: allow },
    entryTypes: new Map(),
    locale: "en",
    direction: "ltr",
    ...overrides,
  };
}

/**
 * `can` as the role hierarchy answers it for `role`, over the capabilities
 * `types` derive.
 */
function roleCan(
  role: UserRole,
  types: BarRenderContext["entryTypes"],
): (capability: string) => boolean {
  const receivers = new Map(
    [...types.values()]
      .flatMap((type) => deriveEntryTypeCapabilities(type))
      .map((cap) => [cap.name, cap.grantTo]),
  );
  return (capability) => receivers.get(capability)?.includes(role) ?? false;
}

/** Core's nodes as the bar for `overrides` shows them. */
function coreNodes(
  overrides: Partial<BarRenderContext> = {},
): ReturnType<typeof collectAdminBarNodes> {
  const bar = ctx(overrides);
  const registry = createPluginRegistry();
  for (const [name, type] of bar.entryTypes)
    registry.entryTypes.set(name, type);
  registerCoreAdminBarNodes(registry);
  registerNewEntryAdminBarNodes(registry);
  return collectAdminBarNodes(
    registry.adminBarNodes.values(),
    bar,
    silentLogger,
  );
}

describe("core admin bar nodes — site link", () => {
  test("adds a 'site' node pointing at the admin root with the resolved site name", () => {
    const nodes = coreNodes();

    const site = nodes.find((n) => n.id === "site");
    expect(site).toEqual({
      id: "site",
      title: "My Site",
      href: "/_plumix/admin",
      group: "root",
      position: 10,
    });
  });
});

describe("core admin bar nodes — +New group", () => {
  test("omits the group when no entry types are registered", () => {
    const nodes = coreNodes();

    expect(nodes.find((n) => n.id === "+new")).toBeUndefined();
  });

  test("omits the group when the viewer may create none of the types", () => {
    const types = new Map([
      [
        "notice",
        toRegisteredEntryType(
          "notice",
          { label: "Notice", capabilities: { create: "editor" } },
          "test",
        ),
      ],
    ]);

    const nodes = coreNodes({
      entryTypes: types,
      auth: { can: roleCan("author", types) },
    });

    expect(nodes.find((n) => n.id === "+new")).toBeUndefined();
  });

  test("adds one child per registered entry type, in registration order", () => {
    // The admin route resolves the derived `adminSlug` (`posts`); the raw
    // name (`post`) 404s.
    const types = new Map([
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
      ["page", toRegisteredEntryType("page", { label: "Page" }, "test")],
      [
        "media",
        toRegisteredEntryType(
          "media",
          { label: "Media", labels: { plural: "Media" } },
          "test",
        ),
      ],
    ]);
    const nodes = coreNodes({ entryTypes: types });

    const children = nodes.filter((n) => n.parent === "+new");
    expect(children.map((n) => n.id)).toEqual([
      "+new:post",
      "+new:page",
      "+new:media",
    ]);
    expect(children.map((n) => n.href)).toEqual([
      "/_plumix/admin/entries/posts/create",
      "/_plumix/admin/entries/pages/create",
      "/_plumix/admin/entries/media/create",
    ]);
  });

  test("titles each child with the type's human singular label, not the raw slug", () => {
    const types = new Map([
      [
        "post",
        toRegisteredEntryType(
          "post",
          { label: "Posts", labels: { singular: "Post" } },
          "test",
        ),
      ],
      ["page", toRegisteredEntryType("page", { label: "Page" }, "test")],
    ]);

    const nodes = coreNodes({ entryTypes: types });

    const titles = nodes.filter((n) => n.parent === "+new").map((n) => n.title);
    expect(titles).toEqual(["Post", "Page"]);
  });

  test("omits non-public types (showUI false) such as menu_item", () => {
    const types = new Map([
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
      [
        "menu_item",
        toRegisteredEntryType(
          "menu_item",
          { label: "Menu item", isPublic: false },
          "test",
        ),
      ],
    ]);

    const nodes = coreNodes({ entryTypes: types });

    const childIds = nodes.filter((n) => n.parent === "+new").map((n) => n.id);
    expect(childIds).toEqual(["+new:post"]);
  });

  test("keeps a private type that explicitly opts back into the UI", () => {
    const types = new Map([
      [
        "secret",
        toRegisteredEntryType(
          "secret",
          { label: "Secret", isPublic: false, showUI: true },
          "test",
        ),
      ],
    ]);

    const nodes = coreNodes({ entryTypes: types });

    expect(nodes.find((n) => n.id === "+new:secret")).toBeDefined();
  });

  test("omits a type whose create capability needs a role above the viewer's", () => {
    const types = new Map([
      ["post", toRegisteredEntryType("post", { label: "Post" }, "test")],
      [
        "notice",
        toRegisteredEntryType(
          "notice",
          { label: "Notice", capabilities: { create: "editor" } },
          "test",
        ),
      ],
    ]);

    const nodes = coreNodes({
      entryTypes: types,
      auth: { can: roleCan("author", types) },
    });

    const childIds = nodes.filter((n) => n.parent === "+new").map((n) => n.id);
    expect(childIds).toEqual(["+new:post"]);
  });
});

describe("core admin bar nodes — account dropdown", () => {
  test("renders the account as a parent titled with the user's email (no direct link)", () => {
    const nodes = coreNodes();

    const account = nodes.find((n) => n.id === "account");
    expect(account).toEqual({
      id: "account",
      title: "editor@cms.example",
      group: "account",
      position: 100,
    });
    expect(account?.href).toBeUndefined();
    expect(account?.parent).toBeUndefined();
  });

  test("titles the account with the display name when the user has one", () => {
    const nodes = coreNodes({
      user: {
        id: 1,
        email: "editor@cms.example",
        name: "Alex Rivera",
        role: "editor",
        meta: {},
      },
    });

    expect(nodes.find((n) => n.id === "account")?.title).toBe("Alex Rivera");
  });

  test("falls back to the email when the name is empty or null", () => {
    const nodes = coreNodes({
      user: {
        id: 1,
        email: "editor@cms.example",
        name: null,
        role: "editor",
        meta: {},
      },
    });

    expect(nodes.find((n) => n.id === "account")?.title).toBe(
      "editor@cms.example",
    );
  });

  test("adds a Profile child linking to the admin profile route", () => {
    const nodes = coreNodes();

    expect(nodes.find((n) => n.id === "account:profile")).toEqual({
      id: "account:profile",
      title: "Profile",
      href: "/_plumix/admin/profile",
      group: "account",
      parent: "account",
      position: 10,
    });
  });

  test("adds a Sign out child carrying the signout action and no href", () => {
    const nodes = coreNodes();

    expect(nodes.find((n) => n.id === "account:signout")).toEqual({
      id: "account:signout",
      title: "Sign out",
      action: "signout",
      group: "account",
      parent: "account",
      position: 20,
    });
  });
});

describe("core admin bar nodes — edit-this link", () => {
  test("does not appear when there is no queried entry", () => {
    const nodes = coreNodes();
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("does not appear when queried entry lacks pre-resolved details", () => {
    const nodes = coreNodes({
      queriedEntry: { kind: "entry", id: 42, preview: false },
    });
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("appears when the renderer says the caller can edit, without asking auth", () => {
    const seen: string[] = [];
    const nodes = coreNodes({
      queriedEntry: { kind: "entry", id: 42, preview: false },
      queriedEntryDetails: { type: "post", canEdit: true },
      auth: {
        can: (cap: string) => {
          seen.push(cap);
          return false;
        },
      },
    });

    expect(nodes.find((n) => n.id === "edit-this")).toEqual({
      id: "edit-this",
      title: "Edit",
      // adminSlug (`posts`), not the type name (`post`) — see the +New test.
      href: "/_plumix/admin/entries/posts/42/edit",
      group: "primary",
      position: 20,
    });
    expect(seen.filter((cap) => cap.startsWith("entry:"))).toEqual([]);
  });

  test("does not appear when the renderer says the caller cannot edit", () => {
    const seen: string[] = [];
    const nodes = coreNodes({
      queriedEntry: { kind: "entry", id: 42, preview: false },
      queriedEntryDetails: { type: "post", canEdit: false },
      auth: {
        can: (cap: string) => {
          seen.push(cap);
          return true;
        },
      },
    });

    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
    expect(seen.filter((cap) => cap.startsWith("entry:"))).toEqual([]);
  });
});
