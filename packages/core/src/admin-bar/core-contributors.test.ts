import { describe, expect, test } from "vitest";

import type { BarRenderContext } from "./types.js";
import { HookRegistry } from "../hooks/registry.js";
import { collectAdminBarNodes } from "./collect.js";
import { registerCoreAdminBarContributors } from "./core-contributors.js";

const allow = (): boolean => true;
const deny = (): boolean => false;

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

function typesMap(...slugs: readonly string[]): BarRenderContext["entryTypes"] {
  return new Map(
    slugs.map((slug) => [slug, { name: slug, label: slug } as never]),
  );
}

function withCore(): HookRegistry {
  const hooks = new HookRegistry();
  registerCoreAdminBarContributors(hooks);
  return hooks;
}

describe("registerCoreAdminBarContributors — site link", () => {
  test("adds a 'site' node pointing at the admin root with the resolved site name", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

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

describe("registerCoreAdminBarContributors — +New group", () => {
  test("emits a parent group with no children when no entry types are registered", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

    const newGroup = nodes.find((n) => n.id === "+new");
    expect(newGroup).toBeDefined();
    expect(nodes.filter((n) => n.parent === "+new")).toEqual([]);
  });

  test("adds one child per registered entry type, in registration order", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({ entryTypes: typesMap("post", "page", "media") }),
    );

    const children = nodes.filter((n) => n.parent === "+new");
    expect(children.map((n) => n.id)).toEqual([
      "+new:post",
      "+new:page",
      "+new:media",
    ]);
    expect(children.map((n) => n.href)).toEqual([
      "/_plumix/admin/entries/post/create",
      "/_plumix/admin/entries/page/create",
      "/_plumix/admin/entries/media/create",
    ]);
  });

  test("titles each child with the type's human singular label, not the raw slug", () => {
    const types = new Map([
      ["post", { name: "post", labels: { singular: "Post" } } as never],
      ["page", { name: "page", label: "Page" } as never],
    ]);

    const nodes = collectAdminBarNodes(withCore(), ctx({ entryTypes: types }));

    const titles = nodes.filter((n) => n.parent === "+new").map((n) => n.title);
    expect(titles).toEqual(["Post", "Page"]);
  });

  test("omits non-public types (showUI false) such as menu_item", () => {
    const types = new Map([
      ["post", { name: "post", label: "Post" } as never],
      [
        "menu_item",
        { name: "menu_item", label: "Menu item", isPublic: false } as never,
      ],
    ]);

    const nodes = collectAdminBarNodes(withCore(), ctx({ entryTypes: types }));

    const childIds = nodes.filter((n) => n.parent === "+new").map((n) => n.id);
    expect(childIds).toEqual(["+new:post"]);
  });

  test("keeps a private type that explicitly opts back into the UI", () => {
    const types = new Map([
      [
        "secret",
        {
          name: "secret",
          label: "Secret",
          isPublic: false,
          showUI: true,
        } as never,
      ],
    ]);

    const nodes = collectAdminBarNodes(withCore(), ctx({ entryTypes: types }));

    expect(nodes.find((n) => n.id === "+new:secret")).toBeDefined();
  });

  test("plugin can suppress its own entry type from the menu via the filter", () => {
    const hooks = withCore();
    hooks.addFilter(
      "admin_bar:nodes",
      (nodes) => nodes.filter((n) => n.id !== "+new:media"),
      { plugin: "media", priority: 100 },
    );

    const nodes = collectAdminBarNodes(
      hooks,
      ctx({ entryTypes: typesMap("post", "page", "media") }),
    );

    const children = nodes.filter((n) => n.parent === "+new");
    expect(children.map((n) => n.id)).toEqual(["+new:post", "+new:page"]);
  });
});

describe("registerCoreAdminBarContributors — account dropdown", () => {
  test("renders the account as a parent titled with the user's email (no direct link)", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

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
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        user: {
          id: 1,
          email: "editor@cms.example",
          name: "Alex Rivera",
          role: "editor",
          meta: {},
        },
      }),
    );

    expect(nodes.find((n) => n.id === "account")?.title).toBe("Alex Rivera");
  });

  test("falls back to the email when the name is empty or null", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        user: {
          id: 1,
          email: "editor@cms.example",
          name: null,
          role: "editor",
          meta: {},
        },
      }),
    );

    expect(nodes.find((n) => n.id === "account")?.title).toBe(
      "editor@cms.example",
    );
  });

  test("adds a Profile child linking to the admin profile route", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());

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
    const nodes = collectAdminBarNodes(withCore(), ctx());

    expect(nodes.find((n) => n.id === "account:signout")).toEqual({
      id: "account:signout",
      title: "Sign out",
      action: "signout",
      group: "account",
      parent: "account",
      position: 20,
    });
  });

  test("translates the dropdown labels via the bar catalog", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({ locale: "de", direction: "ltr" }),
    );

    expect(nodes.find((n) => n.id === "account:profile")?.title).toBe("Profil");
    expect(nodes.find((n) => n.id === "account:signout")?.title).toBe(
      "Abmelden",
    );
  });
});

describe("registerCoreAdminBarContributors — edit-this link", () => {
  test("does not appear when there is no queried entry", () => {
    const nodes = collectAdminBarNodes(withCore(), ctx());
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("does not appear when queried entry lacks pre-resolved details", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({ queriedEntry: { kind: "entry", id: 42 } }),
    );
    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });

  test("translates the title via the bar catalog for the active locale", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        locale: "de",
        direction: "ltr",
        queriedEntry: { kind: "entry", id: 1 },
        queriedEntryDetails: { type: "post", authorId: 1 },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")?.title).toBe("Bearbeiten");
  });

  test("appears for a non-author when auth allows edit_any", () => {
    const seen: string[] = [];
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 42 },
        queriedEntryDetails: { type: "post", authorId: 999 },
        auth: {
          can: (cap: string) => {
            seen.push(cap);
            return cap === "entry:post:edit_any";
          },
        },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toEqual({
      id: "edit-this",
      title: "Edit",
      href: "/_plumix/admin/entries/post/42/edit",
      group: "primary",
      position: 20,
    });
    expect(seen).toContain("entry:post:edit_any");
  });

  test("appears for the entry's author when auth allows edit_own", () => {
    const seen: string[] = [];
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 7 },
        queriedEntryDetails: { type: "post", authorId: 1 },
        auth: {
          can: (cap: string) => {
            seen.push(cap);
            return cap === "entry:post:edit_own";
          },
        },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toBeDefined();
    expect(seen).toContain("entry:post:edit_own");
  });

  test("does not appear when user lacks the capability for own or any", () => {
    const nodes = collectAdminBarNodes(
      withCore(),
      ctx({
        queriedEntry: { kind: "entry", id: 7 },
        queriedEntryDetails: { type: "post", authorId: 999 },
        auth: { can: deny },
      }),
    );

    expect(nodes.find((n) => n.id === "edit-this")).toBeUndefined();
  });
});
